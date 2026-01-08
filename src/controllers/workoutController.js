const parseSet = (s) => ({
    ...s,
    weight: Number(s.weight),
    reps: Number(s.reps),
    orderInExercise: Number(s.orderInExercise),
    isDeleted: s.isDeleted === 'TRUE' || s.isDeleted === true
});

class WorkoutController {
    constructor(googleSheetsService) {
        this.service = googleSheetsService;
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    }

    async handleAction(req, res) {
        const { action, data } = req.body;
        console.log(`Received action: ${action}`, data);
        
        try {
            let result;

            switch (action) {
                case 'session.start':
                    const newSession = {
                        id: 'sess_' + Date.now(),
                        startAt: new Date().toISOString(),
                        endAt: null,
                        note: null
                    };
                    await this.service.addRow(this.spreadsheetId, 'Sessions', newSession);
                    result = newSession;
                    break;
                
                case 'session.end': {
                    const { id } = data;
                    const update = { endAt: new Date().toISOString() };
                    result = await this._updateRow('Sessions', id, update);
                    break;
                }

                case 'exercise.create':
                    const newEx = {
                        id: 'ex_' + Date.now(),
                        name: data.name,
                        lastUsedAt: new Date().toISOString()
                    };
                    await this.service.addRow(this.spreadsheetId, 'Exercises', newEx);
                    result = newEx;
                    break;
                
                case 'exercise.list': {
                    const exercises = await this.service.getSheetData(this.spreadsheetId, 'Exercises');
                    let exs = exercises;
                    if (data && data.query) {
                        exs = exs.filter(e => e.name.toLowerCase().includes(data.query.toLowerCase()));
                    }
                    // Sort by lastUsedAt desc
                    exs.sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''));
                    result = exs;
                    break;
                }

                case 'exercise.lastTime': {
                    const allSets = await this.service.getSheetData(this.spreadsheetId, 'Sets');
                    const candidates = allSets.filter(s => s.exerciseId === data.exerciseId && s.sessionId !== data.currentSessionId);
                    if (candidates.length === 0) {
                        result = null;
                    } else {
                        result = parseSet(candidates[candidates.length - 1]);
                    }
                    break;
                }

                case 'set.create': {
                     const allSets = await this.service.getSheetData(this.spreadsheetId, 'Sets');
                     const existing = allSets.filter(s => s.sessionId === data.sessionId && s.exerciseId === data.exerciseId);
                     
                     const newSet = {
                         id: 'set_' + Date.now(),
                         sessionId: data.sessionId,
                         exerciseId: data.exerciseId,
                         orderInExercise: existing.length + 1,
                         weight: data.weight,
                         reps: data.reps,
                         isDeleted: false
                     };
                     
                     await this.service.addRow(this.spreadsheetId, 'Sets', newSet);
                     
                     // Update exercise lastUsedAt
                     try {
                         const updateEx = { lastUsedAt: new Date().toISOString() };
                         await this._updateRow('Exercises', data.exerciseId, updateEx);
                     } catch(e) {
                         console.error('Failed to update exercise lastUsedAt', e);
                     }
                     
                     result = parseSet(newSet);
                     break;
                }

                case 'set.update': {
                    const { id, ...updates } = data;
                    const updated = await this._updateRow('Sets', id, updates);
                    result = parseSet(updated);
                    break;
                }

                case 'set.delete': {
                    const { id } = data;
                    await this._deleteRow('Sets', id);
                    result = { deleted: true };
                    break;
                }

                case 'history.list': {
                    const sessions = await this.service.getSheetData(this.spreadsheetId, 'Sessions');
                    result = sessions.filter(s => s.endAt && s.endAt !== '');
                    break;
                }

                case 'history.detail': {
                    const sessions = await this.service.getSheetData(this.spreadsheetId, 'Sessions');
                    const session = sessions.find(s => s.id === data.id);
                    if (!session) throw new Error('Session not found');

                    const allSets = await this.service.getSheetData(this.spreadsheetId, 'Sets');
                    const sets = allSets.filter(s => s.sessionId === data.id).map(parseSet);

                    const allExercises = await this.service.getSheetData(this.spreadsheetId, 'Exercises');
                    
                    // Join Exercises
                    const exIds = Array.from(new Set(sets.map(s => s.exerciseId)));
                    const exercises = exIds.map(eid => {
                        const ex = allExercises.find(e => e.id === eid);
                        return { ...(ex || {}), sets: [] };
                    });

                    result = {
                        ...session,
                        sets,
                        exercises
                    };
                    break;
                }
                
                default:
                    // Fallback or error for unimplemented actions
                    throw new Error(`Unknown or unimplemented action: ${action}`);
            }

            res.json({ ok: true, data: result });
        } catch (error) {
            console.error('Controller Error:', error);
            res.status(500).json({ ok: false, error: { message: error.message } });
        }
    }

    // --- Private Helpers ---

    async _updateRow(sheetName, id, updates) {
        // 1. Find Row Index
        const data = await this.service.getSheetData(this.spreadsheetId, sheetName);
        const rowIndex = data.findIndex(row => row.id === id);
        if (rowIndex === -1) throw new Error(`Row with id ${id} not found in ${sheetName}`);

        // 2. Merge Data
        const currentObj = data[rowIndex];
        const updatedObj = { ...currentObj, ...updates };

        // 3. Get Headers to map back to array
        const headersRes = await this.service.sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `${sheetName}!1:1`
        });
        const headers = headersRes.data.values[0];

        const rowValues = headers.map(h => {
             const val = updatedObj[h];
             return val === undefined || val === null ? '' : String(val);
        });

        // 4. Update
        // Row in Sheet = rowIndex + 2 (1-based + 1 header row)
        const range = `${sheetName}!A${rowIndex + 2}`;
        
        await this.service.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowValues] }
        });

        return updatedObj;
    }

    async _deleteRow(sheetName, id) {
        // 1. Find Row Index
        const data = await this.service.getSheetData(this.spreadsheetId, sheetName);
        const rowIndex = data.findIndex(row => row.id === id);
        if (rowIndex === -1) throw new Error(`Row with id ${id} not found in ${sheetName}`);

        // 2. Get Sheet ID (needed for deleteDimension)
        const sheetId = await this._getSheetId(sheetName);
        if (sheetId === null) throw new Error(`Sheet ${sheetName} not found`);

        // 3. Delete
        // Data index 0 = Sheet Row 2.
        // deleteDimension startIndex is 0-based index of the whole sheet.
        // So Data index 0 corresponds to startIndex 1.
        const startIndex = rowIndex + 1;

        await this.service.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            resource: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId,
                            dimension: 'ROWS',
                            startIndex: startIndex,
                            endIndex: startIndex + 1
                        }
                    }
                }]
            }
        });
    }

    async _getSheetId(sheetName) {
        const meta = await this.service.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
        const sheet = meta.data.sheets.find(s => s.properties.title === sheetName);
        return sheet ? sheet.properties.sheetId : null;
    }
}

module.exports = WorkoutController;
