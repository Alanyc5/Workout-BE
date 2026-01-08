const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
dotenv.config();

const setSheetRoutes = require('./routes/sheetRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Google Sheets Backend is running!');
});

setSheetRoutes(app);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});