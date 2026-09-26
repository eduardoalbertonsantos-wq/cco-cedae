const { PERFIL } = require('../utils/constants');

const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Não autenticado' });
    }
    
    if (req.user.perfil !== PERFIL.ADMIN) {
        return res.status(403).json({ success: false, message: 'Acesso negado. Requer privilégios de administrador.' });
    }
    
    next();
};

const requireSupervisor = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Não autenticado' });
    }
    
    if (req.user.perfil !== PERFIL.ADMIN && req.user.perfil !== PERFIL.SUPERVISOR) {
        return res.status(403).json({ success: false, message: 'Acesso negado. Requer privilégios de supervisor ou administrador.' });
    }
    
    next();
};

const requirePainel = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Não autenticado' });
    }
    
    if (req.user.perfil !== PERFIL.ADMIN && req.user.perfil !== PERFIL.DIRETORIA && req.user.perfil !== PERFIL.CONSULTA) {
        return res.status(403).json({ success: false, message: 'Acesso negado. Requer privilégios de CCO ou Diretoria.' });
    }
    
    next();
};

const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: 'Não autenticado' });
    }
    next();
};

module.exports = { requireAdmin, requirePainel, requireSupervisor, requireAuth };
