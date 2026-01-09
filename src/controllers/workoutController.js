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

    // --- Sessions ---

    async startSession(req, res) {
        try {
            const newSession = {
                id: 'sess_' + Date.now(),
                startAt: new Date().toISOString(),
                endAt: null,
                note: null
            };
            await this.service.addRow(this.spreadsheetId, 'Sessions', newSession);
            res.status(201).json({ ok: true, data: newSession });
        } catch (error) {
            this._handleError(res, error);
        }
    }

    async endSession(req, res) {
        try {
            const { id } = req.params;
            // 允許 body 帶入額外資訊 (未實作，但預留擴充性)
            const update = { endAt: new Date().toISOString() };
            const result = await this._updateRow('Sessions', id, update);
            res.json({ ok: true, data: result });
        } catch (error) {
            this._handleError(res, error);
        }
    }

    async deleteSession(req, res) {
        try {
            const { id } = req.params;
            
            // 1. 刪除該 Session 的所有 Sets
            const allSets = await this.service.getSheetData(this.spreadsheetId, 'Sets');
            const setsToDelete = allSets.filter(s => s.sessionId === id);
            
            for (const set of setsToDelete) {
                await this._deleteRow('Sets', set.id).catch(console.error);
            }
            
            // 2. 刪除 Session
            await this._deleteRow('Sessions', id);
            
            res.json({ ok: true, data: { deleted: true } });
        } catch (error) {
            this._handleError(res, error);
        }
    }

    async getHistory(req, res) {
        try {
            const sessions = await this.service.getSheetData(this.spreadsheetId, 'Sessions');
            const allSets = await this.service.getSheetData(this.spreadsheetId, 'Sets');
            
            // 只回傳已結束的 sessions
            let result = sessions.filter(s => s.endAt && s.endAt !== '');
            
            // 過濾掉沒有任何運動的 session
            result = result.filter(session => {
                const sessionSets = allSets.filter(s => 
                    s.sessionId === session.id && 
                    s.isDeleted !== 'TRUE' && 
                    s.isDeleted !== true
                );
                return sessionSets.length > 0;
            });
            
            // 按時間倒序
            result.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
            res.json({ ok: true, data: result });
        } catch (error) {
            this._handleError(res, error);
        }
    }

    async getSessionDetail(req, res) {
        try {
            const { id } = req.params;
            const sessions = await this.service.getSheetData(this.spreadsheetId, 'Sessions');
            const session = sessions.find(s => s.id === id);
            
            if (!session) return res.status(404).json({ ok: false, error: { message: 'Session not found' } });

            const allSets = await this.service.getSheetData(this.spreadsheetId, 'Sets');
            // 過濾並解析 Sets
            const sets = allSets
                .filter(s => s.sessionId === id)
                .map(parseSet)
                .filter(s => !s.isDeleted); // 過濾掉軟刪除的

            const allExercises = await this.service.getSheetData(this.spreadsheetId, 'Exercises');
            
            // 組合 Exercises
            const exIds = Array.from(new Set(sets.map(s => s.exerciseId)));
            const exercises = exIds.map(eid => {
                const ex = allExercises.find(e => e.id === eid);
                return { ...(ex || { id: eid, name: 'Unknown' }), sets: [] };
            });

            const result = { ...session, sets, exercises };
            res.json({ ok: true, data: result });
        } catch (error) {
            this._handleError(res, error);
        }
    }

    // --- Exercises ---

    async createExercise(req, res) {
        try {
            const { name } = req.body;
            if (!name) throw new Error('Exercise name is required');

            const newEx = {
                id: 'ex_' + Date.now(),
                name: name,
                lastUsedAt: new Date().toISOString()
            };
            await this.service.addRow(this.spreadsheetId, 'Exercises', newEx);
            res.status(201).json({ ok: true, data: newEx });
        } catch (error) {
            this._handleError(res, error);
        }
    }

    async getExercises(req, res) {
        try {
            const { query } = req.query;
            let exs = await this.service.getSheetData(this.spreadsheetId, 'Exercises');
            
            if (query) {
                exs = exs.filter(e => e.name.toLowerCase().includes(query.toLowerCase()));
            }
            // Sort by lastUsedAt desc
            exs.sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''));
            res.json({ ok: true, data: exs });
        } catch (error) {
            this._handleError(res, error);
        }
    }

    async getLastSetForExercise(req, res) {
        try {
            const { exerciseId } = req.params;
            const { currentSessionId } = req.query;

            const allSets = await this.service.getSheetData(this.spreadsheetId, 'Sets');
            // 找出該動作的所有 Set，排除目前的 Session
            const candidates = allSets.filter(s => 
                s.exerciseId === exerciseId && 
                s.sessionId !== currentSessionId
            );

            if (candidates.length === 0) {
                return res.json({ ok: true, data: null });
            }
            
            // 取最後一個 (假設 Sheet appending 是按時間序)
            const lastOne = candidates[candidates.length - 1];
            res.json({ ok: true, data: parseSet(lastOne) });
        } catch (error) {
            this._handleError(res, error);
        }
    }

    // --- Sets ---

    async createSet(req, res) {
        try {
            const { sessionId, exerciseId, weight, reps, id } = req.body;
            
            const allSets = await this.service.getSheetData(this.spreadsheetId, 'Sets');
            const existing = allSets.filter(s => s.sessionId === sessionId && s.exerciseId === exerciseId);
            
            const newSet = {
                id: id || ('set_' + Date.now()),
                sessionId,
                exerciseId,
                orderInExercise: existing.length + 1,
                weight,
                reps,
                isDeleted: false
            };
            
            await this.service.addRow(this.spreadsheetId, 'Sets', newSet);
            
            // Side effect: Update exercise lastUsedAt (Fire and forget provided errors are logged)
            this._updateExerciseLastUsed(exerciseId).catch(console.error);
            
            res.status(201).json({ ok: true, data: parseSet(newSet) });
        } catch (error) {
            this._handleError(res, error);
        }
    }

    async updateSet(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body; // e.g. { weight: 50, reps: 10 }
            
            // 排除不應該被更新的欄位
            delete updates.id;
            delete updates.sessionId;

            const updated = await this._updateRow('Sets', id, updates);
            res.json({ ok: true, data: parseSet(updated) });
        } catch (error) {
            this._handleError(res, error);
        }
    }

    async deleteSet(req, res) {
        try {
            const { id } = req.params;
            // 這裡選擇 "軟刪除" (Soft Delete) 比較安全，或者用原本的硬刪除
            // 為了保持你的原邏輯，這裡使用硬刪除
            await this._deleteRow('Sets', id);
            res.json({ ok: true, data: { deleted: true } });
        } catch (error) {
            this._handleError(res, error);
        }
    }

    // --- Internal Helpers ---

    async _updateExerciseLastUsed(exerciseId) {
        await this._updateRow('Exercises', exerciseId, { lastUsedAt: new Date().toISOString() });
    }

    _handleError(res, error) {
        console.error('Controller Error:', error);
        res.status(500).json({ ok: false, error: { message: error.message } });
    }

    async _updateRow(sheetName, id, updates) {
        // Find Index
        const data = await this.service.getSheetData(this.spreadsheetId, sheetName);
        const rowIndex = data.findIndex(row => row.id === id);
        if (rowIndex === -1) throw new Error(`Row with id ${id} not found in ${sheetName}`);

        // Merge
        const currentObj = data[rowIndex];
        const updatedObj = { ...currentObj, ...updates };

        // Get Headers
        const headersRes = await this.service.sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `${sheetName}!1:1`
        });
        const headers = headersRes.data.values[0];

        // Map values
        const rowValues = headers.map(h => {
             const val = updatedObj[h];
             return val === undefined || val === null ? '' : String(val);
        });

        // Update Google Sheet
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
        const data = await this.service.getSheetData(this.spreadsheetId, sheetName);
        const rowIndex = data.findIndex(row => String(row.id).trim() === String(id).trim());
        if (rowIndex === -1) throw new Error(`Row not found`);

        const sheetId = await this._getSheetId(sheetName);
        if (sheetId === null) throw new Error(`Sheet ${sheetName} not found`);

        const startIndex = rowIndex + 1; // Header is row 0 in API logic if using gridRange? Wait.
        // Google Sheets API indices match the visual row number - 1 ??
        // Actually: "startIndex": The zero-based start index of the rows to delete.
        // Visual Row 1 (Header) is index 0. Visual Row 2 (Data 0) is index 1.
        // So rowIndex (0) + 1 = 1. Correct.

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
        let sheet = meta.data.sheets.find(s => s.properties.title === sheetName);
        if (!sheet) {
            sheet = meta.data.sheets.find(s => s.properties.title.trim().toLowerCase() === sheetName.trim().toLowerCase());
        }
        return sheet ? sheet.properties.sheetId : null;
    }
}

module.exports = WorkoutController;
