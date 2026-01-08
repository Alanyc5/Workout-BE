const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const WorkoutController = require('../controllers/workoutController');
const GoogleSheetsService = require('../services/googleSheetsService');
const config = require('../config/google-sheets.config');

const setSheetRoutes = (app) => {
    const router = express.Router();

    // Middleware: Authentication check
    const authMiddleware = (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ ok: false, error: { message: '需登入才能使用' } });
        }

        try {
            // Decode "Basic base64encodedstring"
            const b64auth = authHeader.split(' ')[1];
            const [user, password] = Buffer.from(b64auth, 'base64').toString().split(':');

            if (!user || !password) throw new Error();

            // Check against env variable: USER_SEARCH_PWD
            // user name from client might be lowercase, env is UPPERCASE
            const envVarName = `USER_${user.toUpperCase()}_PWD`;
            const validPassword = process.env[envVarName];

            if (validPassword && validPassword === password) {
                // Attach user info if needed
                req.user = user;
                next();
            } else {
                return res.status(401).json({ ok: false, error: { message: '帳號或密碼錯誤' } });
            }
        } catch (e) {
            return res.status(401).json({ ok: false, error: { message: '驗證格式錯誤' } });
        }
    };

    const auth = new GoogleAuth({
        credentials: {
            client_email: config.auth.client_email,
            private_key: config.auth.private_key,
        },
        scopes: config.scopes,
    });

    const googleSheetsService = new GoogleSheetsService(auth);
    const workoutController = new WorkoutController(googleSheetsService);

    // Apply auth middleware to all routes on this router
    router.use(authMiddleware);

    // New action-based route for frontend compatibility
    router.post('/', workoutController.handleAction.bind(workoutController));

    app.use('/api', router);
};

module.exports = setSheetRoutes;
