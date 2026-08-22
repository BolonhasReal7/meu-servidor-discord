const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const MONGO_URL = 'mongodb+srv://meneguellijuniorrodrigo_db_user:uH3khHbhXwVDnuQQ@cluster0.zrkopl8.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URL)
  .then(() => console.log('✅ Conectado ao MongoDB!'))
  .catch((err) => console.error('❌ Erro no MongoDB:', err));

const userSchema = new mongoose.Schema({
    discordId: String,
    username: String,
    avatar: String,
    friends: [String]
});
const User = mongoose.model('User', userSchema);

let usuariosConectados = {};

// ==========================================
// ROTA DE SINAL DE VIDA PARA O RAILWAY
// ==========================================
app.get('/', (req, res) => {
    res.send('Servidor Kaneki Online e Roteando!');
});

io.on('connection', (socket) => {
    console.log('🔌 Novo dispositivo conectado. Socket ID:', socket.id);

    socket.on('registrar', async (userData) => {
        console.log(`📝 Registrando usuário: ${userData.username} (ID: ${userData.id})`);
        usuariosConectados[userData.id] = socket.id;
        
        let user = await User.findOne({ discordId: userData.id });
        if (!user) {
            user = new User({ discordId: userData.id, username: userData.username, avatar: userData.avatar });
            await user.save();
        }
        const amigos = await User.find({ discordId: { $in: user.friends } });
        socket.emit('carregar-amigos', amigos);
    });

    socket.on('adicionar-amigo', async (data) => {
        console.log("\n====================================");
        console.log("📩 ALGUÉM CLICOU NO BOTAO DE +");
        console.log("Dados recebidos do app:", data);
        
        const { meuId, amigoId } = data;
        const eu = await User.findOne({ discordId: meuId });
        
        if(eu) {
            const socketDoAmigo = usuariosConectados[amigoId];
            if(socketDoAmigo) {
                io.to(socketDoAmigo).emit('pedido-amizade', {
                    deId: meuId,
                    nome: eu.username,
                    avatar: eu.avatar
                });
                console.log("✅ Pedido disparado para a tela do amigo!");
            } else {
                console.log("❌ O amigo não está na lista de conectados!");
            }
        }
        console.log("====================================\n");
    });

    socket.on('aceitar-amizade', async (data) => {
        const { meuId, deId } = data;
        await User.updateOne({ discordId: meuId }, { $addToSet: { friends: deId } });
        await User.updateOne({ discordId: deId }, { $addToSet: { friends: meuId } });

        const eu = await User.findOne({ discordId: meuId });
        const meusAmigos = await User.find({ discordId: { $in: eu.friends } });
        socket.emit('carregar-amigos', meusAmigos);

        const socketDeQuemEnviou = usuariosConectados[deId];
        if(socketDeQuemEnviou) {
            const amigo = await User.findOne({ discordId: deId });
            const amigosDele = await User.find({ discordId: { $in: amigo.friends } });
            io.to(socketDeQuemEnviou).emit('carregar-amigos', amigosDele);
        }
    });

    // ==========================================
    // SISTEMA DE WEBRTC P2P (LIGAÇÃO)
    // ==========================================
    socket.on('chamar-amigo', (data) => {
        const socketDoAmigo = usuariosConectados[data.para];
        if(socketDoAmigo) {
            io.to(socketDoAmigo).emit('chamada-recebida', { offer: data.offer, de: socket.id });
        }
    });

    socket.on('responder-chamada', (data) => {
        io.to(data.para).emit('resposta-recebida', data.answer);
    });

    socket.on('ice-candidate', (data) => {
        io.to(data.para).emit('ice-candidate', data.candidate);
    });

    socket.on('disconnect', () => {
        for (let id in usuariosConectados) {
            if (usuariosConectados[id] === socket.id) {
                console.log(`🔴 Usuário ${id} desconectou.`);
                delete usuariosConectados[id];
                break;
            }
        }
    });
});

// ==========================================
// FORÇANDO A PORTA PARA O RAILWAY
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 Servidor rodando perfeitamente na porta ${PORT}...`);
});