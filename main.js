var ChessImageGenerator = require("chess-image-generator")
var fs = require('fs')
const crypto = require("crypto")
var FFmpeg = require('fluent-ffmpeg');

var lineReader = require('readline').createInterface({
  input: fs.createReadStream('sampleEvent.pgn')
});

const id = crypto.randomBytes(16).toString("hex");
fs.mkdirSync(id);

var header = '';
var index = 0;
var images = [];

lineReader.on('line', async function (line) {
  const imageGenerator = new ChessImageGenerator({
    padding: [288, 44, 268, 44],
    size: 1316
  });
  if(!line.startsWith('1')) {
    header += line + '\n';
  }
  else {
    for(i = 1;;i++) {
      index = line.indexOf(i+1+'.');
      if(index != -1) {
        slice = line.slice(0, index-1);  
        await imageGenerator.loadPGN(header + slice);
        await imageGenerator.generatePNG(id + '/pos' + i + '.png');
        images.push(id + '/pos' + i + '.png');
      } else {
        index = line.indexOf('{');
        slice = line.slice(0, index-1);  
        await imageGenerator.loadPGN(header + slice);
        await imageGenerator.generatePNG(id + '/pos' + i + '.png');
        images.push(id + '/pos' + i + '.png');
        return;
      }
    }
  } 
});

lineReader.on('close', function () {  
  var patternCommand = FFmpeg({ source: id + '/pos%d.png' })
  .withFPSInput(1)    
  .withFps(1)
  .withFpsOutput(1)
  .on('end', function() {
    console.log('Processing finished !');
  })
  .saveToFile(id + '/output.mp4');
});
