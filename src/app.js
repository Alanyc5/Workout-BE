const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
dotenv.config();

const setSheetRoutes = require('./routes/sheetRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// 重要：允許前端發送 Authorization Header
app.use(cors({
    origin: '*', // 為了開發方便允許所有來源，生產環境建議改為前端的網址
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Google Sheets Backend is running! (REST Mode)');
});

setSheetRoutes(app);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});