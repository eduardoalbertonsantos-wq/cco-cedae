const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cco-secret-key-change-in-production-2026';

const authenticateToken = (req, res, next) => {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.split(' ')[1]) {
        token = authHeader.split(' ')[1];
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Acesso negado. Token não fornecido.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Token inválido ou expirado.' });
        }
        req.user = user;
        if (user.id && user.setor_id === undefined) {
            try {
                const { getDb } = require('../database/db');
                const dbUser = getDb().prepare('SELECT setor_id FROM usuarios WHERE id = ?').get(user.id);
                if (dbUser) req.user.setor_id = dbUser.setor_id;
            } catch (e) {}
        }
        next();
    });
};

const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (!err && user) {
            req.user = user;
            if (user.id && user.setor_id === undefined) {
                try {
                    const { getDb } = require('../database/db');
                    const dbUser = getDb().prepare('SELECT setor_id FROM usuarios WHERE id = ?').get(user.id);
                    if (dbUser) req.user.setor_id = dbUser.setor_id;
                } catch (e) {}
            }
        }
        next();
    });
};

module.exports = { authenticateToken, optionalAuth };
