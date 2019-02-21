// server.js
var express = require('express');  
var app = express();  
var server = require('http').createServer(app); 
var io = require('socket.io')(server);
var events = require('events');
var db = require("./database")();

var debugMode = false;

app.use(express.static(__dirname + '/public')); 
//redirect / to our index.html file
app.get('/', function(req, res,next) {  
    res.sendFile(__dirname + '/public/index.html');
});
app.get('/about', function(req, res) {
    res.send('about');
});

var com = require("./serial-port")('COM3',{
    baudRate: 128000
});

var eventEmitter = new events.EventEmitter();
//when a client connects, do this
io.on('connection', function(client) {  
    console.log('Socket: client connected');
    client.on('debugMode', function(data) { //get light switch status from client
       console.log('debugMode:', data); //turn LED on or off, for now we will just show it in console.log
       debugMode = data;
    });

    client.on('clearEmpty', function(data) { //get light switch status from client
      console.log('clearEmpty:', data); //turn LED on or off, for now we will just show it in console.log
      db.deleteData('probe', {temp: 0}, () => {
        client.emit('newData');
      });
   });

   client.on('sendToSerial', function(data) { //get light switch status from client
        console.log('sendToSerial:', data); //turn LED on or off, for now we will just show it in console.log
        com.writeData([33,42,1]);
    });

   eventEmitter.on('newData', function() {
        client.emit('newData');
   });
});

//start our web server and socket.io server listening
server.listen(3000, function(){
  console.log('HTTP server on port 3000');
}); 

var prevData;
var k_adc = 3.3/4095;
var k_v = 4.11/1.98;
com.readData(function(str) {
	str.bat_v = Math.round((str.bat_v*4+1960)*k_adc*k_v*100)/100;

    if (debugMode) 
        console.info('temp:', str.temp.toFixed(1),' hum:', str.hum.toFixed(1), ' date ', str.date.toISOString(), ' pipe ', str.pipe, ' tx_res ', str.tx_res, 'bat_v', str.bat_v);
    var skip = false;
    if (prevData) {
        if ((str.date.getTime() - prevData) < 2000)
            skip = true;
    }
    prevData = str.date.getTime();
    if (!skip) {
        db.writeData('probe', [str]);
        eventEmitter.emit('newData');
    }
    com.writeData([2,0,0]);
})
app.get('/docs/:docDate', function(req, res) {
    db.readData('probe', {
        serverDate: {
            $gte: new Date(req.params.docDate)
        }
    }, function(data){
        res.json(data);
    });
});
