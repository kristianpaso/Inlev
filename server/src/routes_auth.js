
const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin, login, listUsers, createUser, updateUser } = require('./auth');

router.post('/auth/login', login);
router.get('/auth/me', authenticate, (req,res)=> res.json({user:{name:req.user.sub, role:req.user.role}}));

router.get('/admin/users', authenticate, requireAdmin, listUsers);
router.post('/admin/users', authenticate, requireAdmin, createUser);
router.put('/admin/users/:username', authenticate, requireAdmin, updateUser);

module.exports = router;
