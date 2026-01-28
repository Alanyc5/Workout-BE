const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const WorkoutController = require('../controllers/workoutController');
const MotivationController = require('../controllers/motivationController');
const GoogleSheetsService = require('../services/googleSheetsService');
const config = require('../config/google-sheets.config');

const setSheetRoutes = (app) => {
    const router = express.Router();

    // --- Authentication Middleware ---
    const authMiddleware = (req, res, next) => {
        // 對於 OPTIONS (Preflight) 請求，直接放行，否則瀏覽器會被 CORS 擋住
        if (req.method === 'OPTIONS') return next();

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ ok: false, error: { message: 'Missing Authorization header' } });
        }

        try {
            const b64auth = authHeader.split(' ')[1];
            const [user, password] = Buffer.from(b64auth, 'base64').toString().split(':');

            if (!user || !password) throw new Error();

            const envVarName = `USER_${user.toUpperCase()}_PWD`;
            const validPassword = process.env[envVarName];

            if (validPassword && validPassword === password) {
                req.user = user;
                next();
            } else {
                return res.status(401).json({ ok: false, error: { message: 'Invalid credentials' } });
            }
        } catch (e) {
            return res.status(401).json({ ok: false, error: { message: 'Auth format error' } });
        }
    };

    // --- Setup Dependencies ---
    const auth = new GoogleAuth({
        credentials: {
            client_email: config.auth.client_email,
            private_key: config.auth.private_key,
        },
        scopes: config.scopes,
    });
    const googleSheetsService = new GoogleSheetsService(auth);
    const workoutController = new WorkoutController(googleSheetsService);
    const motivationController = new MotivationController(googleSheetsService);

    // Apply Middleware
    router.use(authMiddleware);

    // --- Routes (RESTful) ---

    // Motivations
    router.get('/motivations', (req, res) => motivationController.getMotivations(req, res));
    router.post('/motivations', (req, res) => motivationController.createMotivation(req, res));
    router.post('/motivations/:id/react', (req, res) => motivationController.toggleReaction(req, res));

    // History & Sessions
    router.get('/history', (req, res) => workoutController.getHistory(req, res));
    router.get('/sessions/:id', (req, res) => workoutController.getSessionDetail(req, res)); // Previous "history.detail"
    
    // Session Actions
    router.post('/sessions', (req, res) => workoutController.startSession(req, res));
    router.put('/sessions/:id/end', (req, res) => workoutController.endSession(req, res));
    router.delete('/sessions/:id', (req, res) => workoutController.deleteSession(req, res));
    router.put('/sessions/:id/exercises/:exerciseId/note', (req, res) => workoutController.updateExerciseNote(req, res));

    // Exercises
    router.get('/exercises', (req, res) => workoutController.getExercises(req, res));
    router.post('/exercises', (req, res) => workoutController.createExercise(req, res));
    router.get('/exercises/:exerciseId/last-set', (req, res) => workoutController.getLastSetForExercise(req, res));

    // Sets
    router.post('/sets', (req, res) => workoutController.createSet(req, res));
    router.put('/sets/:id', (req, res) => workoutController.updateSet(req, res));
    router.delete('/sets/:id', (req, res) => workoutController.deleteSet(req, res));

    app.use('/api', router);
};

module.exports = setSheetRoutes;
