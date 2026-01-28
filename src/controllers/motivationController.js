class MotivationController {
    constructor(googleSheetsService) {
        this.service = googleSheetsService;
        this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    }

    async getMotivations(req, res) {
        try {
            // Read Motivations sheet
            const rows = await this.service.getSheetData(this.spreadsheetId, 'Motivations').catch(() => []);
            
            const now = new Date();
            const limit = new Date(now.getTime() - 36 * 60 * 60 * 1000); // 36 hours ago

            // Filter & Parse Reactions JSON
            const active = rows
                .filter(row => {
                    const created = new Date(row.createdAt);
                    return created > limit;
                })
                .map(row => {
                    let reactions = {};
                    try {
                        reactions = row.reactions ? JSON.parse(row.reactions) : {};
                    } catch (e) {}
                    return { ...row, reactions };
                });

            // Sort by time descending (newest first)
            active.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            res.json({ ok: true, data: active });
        } catch (error) {
            console.error(error);
            res.status(500).json({ ok: false, error: { message: error.message } });
        }
    }

    async createMotivation(req, res) {
        try {
            const { message } = req.body;
            const userId = req.user.username || req.user; // Depends on how authMiddleware sets req.user
            if (!message) throw new Error("Message required");

            const newMsg = {
                id: 'msg_' + Date.now(),
                userId,
                message,
                createdAt: new Date().toISOString(),
                reactions: '{}' // stringified JSON for storage
            };

            await this.service.addRow(this.spreadsheetId, 'Motivations', newMsg);
            
            // Return parsed structure
            res.json({ ok: true, data: { ...newMsg, reactions: {} } });
        } catch (error) {
            console.error(error);
            res.status(500).json({ ok: false, error: { message: error.message } });
        }
    }

    async toggleReaction(req, res) {
        try {
            const { id } = req.params;
            const { emoji } = req.body; 
            const userId = req.user.username || req.user;

            const allRows = await this.service.getSheetData(this.spreadsheetId, 'Motivations');
            const rowIndex = allRows.findIndex(r => r.id === id);

            if (rowIndex === -1) throw new Error("Message not found or expired");

            const row = allRows[rowIndex];
            let reactions = {};
            try {
                reactions = row.reactions ? JSON.parse(row.reactions) : {};
            } catch (e) {}

            if (!reactions[emoji]) reactions[emoji] = [];

            // Toggle logic
            if (reactions[emoji].includes(userId)) {
                reactions[emoji] = reactions[emoji].filter(u => u !== userId);
            } else {
                reactions[emoji].push(userId);
            }

            // Update Sheet
            const headersRes = await this.service.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Motivations!1:1'
            });
            const headers = headersRes.data.values[0];
            const colIndex = headers.indexOf('reactions');
            
            if (colIndex !== -1) {
                 const colLetter = String.fromCharCode(65 + colIndex); 
                 // Visual Row = rowIndex + 2 (1 for header, 0-index adjustment)
                 const range = `Motivations!${colLetter}${rowIndex + 2}`;
                 // Using sendData to update raw value, need to ensure stringify
                 await this.service.sendData(this.spreadsheetId, range, [[JSON.stringify(reactions)]]);
            }

            res.json({ ok: true, data: reactions });

        } catch (error) {
            console.error(error);
            res.status(500).json({ ok: false, error: { message: error.message } });
        }
    }
}

module.exports = MotivationController;