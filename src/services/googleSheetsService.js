const { sheets } = require('@googleapis/sheets');

class GoogleSheetsService {
    constructor(auth) {
        this.auth = auth;
        this.sheets = sheets({ version: 'v4', auth });
    }

    async getSheetData(spreadsheetId, sheetName) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!A:Z`, 
            });
            
            const rows = response.data.values;
            if (!rows || rows.length === 0) return [];
            
            // Convert to array of objects using header row
            const headers = rows[0];
            const data = rows.slice(1).map(row => {
                let obj = {};
                headers.forEach((header, index) => {
                    obj[header] = row[index];
                });
                return obj;
            });
            return data;
        } catch (error) {
            console.error('Fetch error:', error);
            throw new Error(`Error fetching data: ${error.message}`);
        }
    }

    async addRow(spreadsheetId, sheetName, dataObj) {
        try {
            // 1. Get headers
            const headersRes = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${sheetName}!1:1`
            });
            
            if (!headersRes.data.values) throw new Error(`Sheet ${sheetName} has no headers`);
            const headers = headersRes.data.values[0];

            // 2. Map data to headers
            const rowValues = headers.map(header => {
                const val = dataObj[header];
                return val === undefined || val === null ? '' : val;
            });

            // 3. Append row
            await this.sheets.spreadsheets.values.append({
                spreadsheetId,
                range: sheetName,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowValues] },
            });
            
            return dataObj;
        } catch (error) {
            throw new Error(`Error adding row to ${sheetName}: ${error.message}`);
        }
    }

    async fetchData(spreadsheetId, range) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range,
            });
            return response.data.values;
        } catch (error) {
            throw new Error(`Error fetching data: ${error.message}`);
        }
    }

    async sendData(spreadsheetId, range, values) {
        try {
            const resource = {
                values,
            };
            const response = await this.sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                resource,
            });
            return response.data;
        } catch (error) {
            throw new Error(`Error sending data: ${error.message}`);
        }
    }
}

module.exports = GoogleSheetsService;