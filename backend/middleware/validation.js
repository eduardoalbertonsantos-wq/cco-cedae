const validatePlantao = (req, res, next) => {
    const { setor_id, data_plantao, km_inicial, km_final, fiscalizacoes } = req.body;

    if (!setor_id) {
        return res.status(400).json({ success: false, message: 'O setor é obrigatório.' });
    }
    
    if (!data_plantao) {
        return res.status(400).json({ success: false, message: 'A data do plantão é obrigatória.' });
    }

    if (km_final !== undefined && km_inicial !== undefined && km_final < km_inicial) {
        return res.status(400).json({ success: false, message: 'O KM final não pode ser menor que o KM inicial.' });
    }

    if (!fiscalizacoes || !Array.isArray(fiscalizacoes) || fiscalizacoes.length === 0) {
        return res.status(400).json({ success: false, message: 'A lista de fiscalizações é obrigatória.' });
    }

    next();
};

const validateLogin = (req, res, next) => {
    const { email, senha } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: 'O email é obrigatório.' });
    }
    
    if (!senha) {
        return res.status(400).json({ success: false, message: 'A senha é obrigatória.' });
    }
    
    next();
};

const validateCadastro = (req, res, next) => {
    const { nome } = req.body;
    
    if (!nome || nome.trim() === '') {
        return res.status(400).json({ success: false, message: 'O nome é obrigatório.' });
    }
    
    next();
};

module.exports = { validatePlantao, validateLogin, validateCadastro };
