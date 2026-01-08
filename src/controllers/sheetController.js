class SheetController {
    constructor(googleSheetsService) {
        this.googleSheetsService = googleSheetsService;
    }

    async getSheetData(req, res) {
        const { spreadsheetId, range } = req.params;
        try {
            const data = await this.googleSheetsService.fetchData(spreadsheetId, range);
            res.status(200).json(data);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async updateSheetData(req, res) {
        const { spreadsheetId, range } = req.params;
        const { values } = req.body;
        try {
            await this.googleSheetsService.sendData(spreadsheetId, range, values);
            res.status(200).json({ message: 'Data updated successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = SheetController;