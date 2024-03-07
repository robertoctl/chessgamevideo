const TelegramBot = require('node-telegram-bot-api');
const AWS = require('aws-sdk');
const crypto = require("crypto")
const base64url = require('base64url');
var ChessImageGenerator = require("chess-image-generator")
var fs = require('fs')
var ffmpeg = require('fluent-ffmpeg');

AWS.config.update({ region: "us-east-1" });

const s3 = new AWS.S3();
const ssm = new AWS.SSM()
const BUCKET_NAME = 'chessgamevideo';

(async() => {
  const ssm = new AWS.SSM();
  const parameter = await ssm.getParameter({ 
      Name: '/chessgamevideo/telegram_bot_token', 
      WithDecryption: true 
  }).promise();

  const token = parameter.Parameter.Value;
  const bot = new TelegramBot(token, { polling: true });
  var lastIndex = 0;

  bot.on('message', (msg) => {
    try {
      const chatId = msg.chat.id;
      const messageText = msg.text;
      main(chatId, messageText);
    } catch(error) {
      console.log(error);
    }
  });

  async function main(chatId, messageText) {
    try {
      console.log("## New event received ##");
      bot.sendMessage(chatId, 'Generating your video...');
      path = 'work/' + base64url(crypto.randomBytes(16));
      await generateImages(path, messageText, chatId)
      await sleep(1000);
      await generateVideo(path, chatId);
      await sendVideo(path, chatId);
      await saveEventToS3(path, messageText, chatId);
      console.log("## Success! ##");
    } catch(error) {
      console.log(error);
    } finally {
      cleanup(path, chatId);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function generateImages(path, messageText, chatId) {
    try{
      console.log('Generate images for path: ' + path + ' and chatId: ' + chatId);
      fs.mkdirSync(path);
      var header = '';
      var index = 0;
      var arr = messageText.split('\n');
      const imageGenerator = new ChessImageGenerator({
        padding: [288, 44, 268, 44],
        size: 1316
      });
      for(i = 0; i < arr.length; i++) {
        line = arr[i];
        if(!line.startsWith('1')) {
          header += line + '\n';
        }
        else {
          for(i = 1;;i++) {
            index = line.indexOf(i+1+'.');
            if(index != -1) {
              slice = line.slice(0, index-1);  
              await imageGenerator.loadPGN(slice);
              await imageGenerator.generatePNG(path + '/pos' + i + '.png');
            } else {
              index = line.indexOf('{');
              slice = line.slice(0, index-1);  
              await imageGenerator.loadPGN(slice);
              await imageGenerator.generatePNG(path + '/pos' + i + '.png');
              lastIndex = i;
              break;
            }
          }
        } 
      }    
      console.log('Finished generating images for path: ' + path + ' and chatId: ' + chatId);
    } catch (error) {
      console.log(error);
      bot.sendMessage(chatId, 'Seems not a valid PGN file');
    }
  }

  async function generateVideo(path, chatId){
    try {
      console.log('Generate video for path: ' + path + ' and chatId: ' + chatId);
      return new Promise((resolve,reject)=>{
        var patternCommand = ffmpeg({ source: path + '/pos%d.png' })
          .inputFPS(1)
          .fps(5)
          .videoCodec('libx264')
          .on('error', function(error) {
            console.log('Cannot process video: ' + error.message);
            bot.sendMessage(chatId, 'Error while generating the video 0x01');
            return reject(error)
          })
          .on('end', function() {
            console.log('Finished generating video for path: ' + path + ' and chatId: ' + chatId);
          })
          .save(path + '/output.mp4')
          .on('end', ()=>{
            console.log('Finished saving video for path: ' + path + ' and chatId: ' + chatId);
            return resolve()
          })
          .on('err',(error)=>{
            console.log(error.message);
            return reject(error)
          });
      })
    } catch(error) {
      console.log(error.message);
      bot.sendMessage(chatId, 'Error while generating the video 0x02');
      return reject(error)
    }
  }

  async function sendVideo(path, chatId) {
    try {
      console.log('Send video for path: ' + path + ' and chatId: ' + chatId);
      return new Promise((resolve,reject)=>{
        bot.sendVideo(chatId, path + '/output.mp4');
        console.log('Finished sending video for path: ' + path + ' and chatId: ' + chatId);
        return resolve()
      });
    } catch(error) {
      console.log(error.message);
      bot.sendMessage(chatId, 'Error while sending the video');
    }
  }

  async function saveEventToS3(path, messageText, chatId) {
    try {
      console.log('Save event to S3 for path: ' + path + ' and chatId: ' + chatId);
      const video = fs.readFileSync(path + '/output.mp4');
      const videoParams = {
        Bucket: BUCKET_NAME,
        Key: path + '/output.mp4',
        Body: video
      };
      await s3.upload(videoParams, function(err, data) {if (err) {throw err;}}).promise();
      
      const pgnParams = {
        Bucket: BUCKET_NAME,
        Key: path + '/event.pgn',
        Body: messageText
      };
      await s3.upload(pgnParams, function(err, data) {if (err) {throw err;}}).promise();
      
      const pngLastPosition = fs.readFileSync(path + '/pos' + lastIndex + '.png');
      const pngParams = {
        Bucket: BUCKET_NAME,
        Key: path + '/pos' + lastIndex + '.png',
        Body: pngLastPosition
      };
      await s3.upload(pngParams, function(err, data) {if (err) {throw err;}}).promise();

      console.log('Finished saving event to S3 for path: ' + path + ' and chatId: ' + chatId);
    
    } catch(error) {
      console.log(error.message);
      bot.sendMessage(chatId, 'General error');
    }
  }

  function cleanup(path, chatId) {
    try {
      console.log('Cleanup path: ' + path + ' and chatId: ' + chatId);
      fs.rmSync(path, { recursive: true, force: true });
      console.log('Finished doing cleanup for path: ' + path + ' and chatId: ' + chatId);
    } catch(error) {
      console.log(error.message);
      bot.sendMessage(chatId, 'Error while performing cleanup');
    }
  }

})();