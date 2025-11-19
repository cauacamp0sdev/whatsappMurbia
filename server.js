const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(express.json());

let whatsappClient = null;
const mensagensEnviadas = new Set();
const tempoLimiteLog = 5 * 60 * 1000;

function formatarData() {
  const agora = new Date();
  const dia = String(agora.getDate()).padStart(2, '0');
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const ano = agora.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function formatarType(type) {
  const tiposMap = {
    'mapeamento': 'Mapeamento',
    'comunicacao': 'Comunicação',
    'metragem': 'Metragem'
  };
  return tiposMap[type.toLowerCase()] || type;
}

function gerarMensagemResposta(nome, protocolNumber, type, isEmergencial) {
  const data = formatarData();
  const emergencialTexto = isEmergencial ? `, *EMERGÊNCIA*` : '';
  return `Olá ${nome}, você recebeu uma solicitação, com o protocolo *${protocolNumber}*, tipo: ${type}${emergencialTexto}, data: ${data}. Clique no link abaixo para acessar a solicitação: https://www.mapsync.com.br/occurrencesa`;
}

function inicializarWhatsApp() {
  whatsappClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: './auth'
    })
  });

  whatsappClient.on('qr', (qr) => {
    console.log('Escaneie o QR Code abaixo com seu WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  whatsappClient.on('ready', () => {
    console.log('Cliente WhatsApp está pronto!');
    console.log('Informações do cliente:', whatsappClient.info);
  });

  whatsappClient.on('message_ack', (msg, ack) => {
    const messageId = msg.id._serialized;
    if (!mensagensEnviadas.has(messageId)) {
      return;
    }
    
    if (ack == 1) {
      console.log(`✓ Mensagem enviada ao servidor: ${messageId}`);
    } else if (ack == 2) {
      console.log(`✓ Mensagem entregue: ${messageId}`);
    } else if (ack == 3) {
      console.log(`✓ Mensagem lida: ${messageId}`);
      mensagensEnviadas.delete(messageId);
    }
  });

  whatsappClient.on('authenticated', () => {
    console.log('Autenticado com sucesso!');
  });

  whatsappClient.on('auth_failure', (msg) => {
    console.error('Falha na autenticação:', msg);
  });

  whatsappClient.on('disconnected', (reason) => {
    console.log('Cliente desconectado:', reason);
  });

  whatsappClient.initialize();
}

function formatarTelefone(telefone) {
  let numero = telefone.replace(/\D/g, '');
  if (!numero.startsWith('55')) {
    numero = '55' + numero;
  }
  return numero + '@c.us';
}

async function validarNumeroWhatsApp(telefone) {
  try {
    const numeroFormatado = formatarTelefone(telefone);
    
    if (whatsappClient.getNumberId) {
      const numeroId = await whatsappClient.getNumberId(numeroFormatado);
      if (!numeroId) {
        throw new Error('Número não encontrado no WhatsApp');
      }
      return numeroId._serialized;
    } else {
      return numeroFormatado;
    }
  } catch (error) {
    console.error('Erro ao validar número:', error);
    const numeroFormatado = formatarTelefone(telefone);
    console.log(`Tentando enviar diretamente para: ${numeroFormatado}`);
    return numeroFormatado;
  }
}

async function enviarMensagemWhatsApp(telefone, mensagem) {
  try {
    if (!whatsappClient || !whatsappClient.info) {
      throw new Error('Cliente WhatsApp não está pronto');
    }

    console.log(`Validando número: ${telefone}`);
    const numeroValido = await validarNumeroWhatsApp(telefone);
    console.log(`Número formatado: ${numeroValido}`);

    console.log(`Enviando mensagem para: ${numeroValido}`);
    const resultado = await whatsappClient.sendMessage(numeroValido, mensagem);
    const messageId = resultado.id._serialized;
    mensagensEnviadas.add(messageId);
    console.log(`Mensagem enviada. ID: ${messageId}`);

    setTimeout(() => {
      mensagensEnviadas.delete(messageId);
    }, tempoLimiteLog);

    return { sucesso: true, mensagem: 'Mensagem enviada com sucesso', messageId };
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    throw error;
  }
}

app.post('/mensagem', async (req, res) => {
  try {
    const { type, protocolNumber, isEmergencial } = req.body;
    const nome = 'Nelson';
    const telefone = '7991624887'; // Nelson 
    // const telefone = '7998054756'; // Número de teste
    if (!type || !protocolNumber) {
      return res.status(400).json({
        erro: true,
        mensagem: 'Campos obrigatórios: type e protocolNumber'
      });
    }

    const tiposValidos = ['mapeamento', 'comunicacao', 'metragem'];
    if (!tiposValidos.includes(type.toLowerCase())) {
      return res.status(400).json({
        erro: true,
        mensagem: `Tipo de ocorrência inválido. Tipos permitidos: ${tiposValidos.join(', ')}`
      });
    }

    const typeFormatado = formatarType(type);
    console.log(`Recebida mensagem - Nome: ${nome}, Telefone: ${telefone}, Protocolo: ${protocolNumber}, Tipo: ${typeFormatado}, Emergencial: ${isEmergencial || false}`);

    const mensagem = gerarMensagemResposta(nome, protocolNumber, typeFormatado, isEmergencial === true);
    await enviarMensagemWhatsApp(telefone, mensagem);

    res.json({
      sucesso: true,
      mensagem: 'Mensagem processada e enviada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    res.status(500).json({
      erro: true,
      mensagem: 'Erro ao processar mensagem: ' + error.message
    });
  }
});

app.get('/status', (req, res) => {
  const status = whatsappClient && whatsappClient.info ? 'conectado' : 'desconectado';
  res.json({ status });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  inicializarWhatsApp();
});

