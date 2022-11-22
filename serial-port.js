const SerialPort = require('serialport');
const Buffer = require('buffer').Buffer;
const EventEmitter = require('events').EventEmitter;

const TIMEOT_MS = 500;
let timer, debData = [];

const CorrectionData = [
  { 
    UID: 2228289,
    temp_cor: 4,
    hum_cor: 0
  },
  { 
    UID: 4587579,
    temp_cor: 0,
    hum_cor: 7
  },
  { 
    UID: 2228287,
    temp_cor: 2,
    hum_cor: -19
  },
  { 
    UID: 4587581,
    temp_cor: 3,
    hum_cor: 3
  },
]

const ErrorFlags = [
  'DHTNoDevice',
  'DHTTiming',
  'DHTTimeout',
  'DHTParity',
  'NMI',
  'HardFault',
  'MemManage',
  'BusFault',
  'UsageFault',
  'Generic',
  'Reserved1',
  'Reserved2',
  'Reserved3',
  'Reserved4',
  'Reserved5',
  'Reserved6',
]

function debounceData(comData, callback) {
  if (timer) {
    clearTimeout(timer);
    debData = [].concat(debData, comData);
  } else {
    debData = comData;
  }
  if (debData && debData.length > 20) {
    timer = undefined;
    callback(debData);
    debData = [];
  } else {
    timer = setTimeout(() => {
      timer = undefined;
      callback(debData);
      debData = [];
    }, TIMEOT_MS);
  }
}

function decodeDate(zipDate) {
  let s, m, h, dd, mm, yy;
  s = zipDate & 63;
  zipDate = zipDate >> 6;
  m = zipDate & 63;
  zipDate = zipDate >> 6;
  h = zipDate & 31;
  zipDate = zipDate >> 5;
  dd = zipDate & 31;
  zipDate = zipDate >> 5;
  mm = zipDate & 15;
  zipDate = zipDate >> 4;
  yy = zipDate & 63;
  return new Date(Date.UTC(2000 + yy, mm - 1, dd, h, m, s));
}

function encodeDate(date) {
  let zipDate;
  zipDate = date.getUTCFullYear() - 2000;
  zipDate = zipDate << 4;
  zipDate += date.getUTCMonth() + 1;
  zipDate = zipDate << 5;
  zipDate += date.getUTCDate();
  zipDate = zipDate << 5;
  zipDate += date.getUTCHours();
  zipDate = zipDate << 6;
  zipDate += date.getUTCMinutes();
  zipDate = zipDate << 6;
  zipDate += date.getUTCSeconds();
  return zipDate;
}

function dataSize(indexContainer, size) {
  const shift = indexContainer.index;
  indexContainer.index+=size;
  return shift;
}

function UINT_8(buffer, indexContainer) {
  return buffer.readUInt8(dataSize(indexContainer, 1));
}
function INT_8(buffer, indexContainer) {
  return buffer.readInt8(dataSize(indexContainer, 1));
}
function UINT_16(buffer, indexContainer) {
  return buffer.readUInt16LE(dataSize(indexContainer, 2));
}
function INT_16(buffer, indexContainer) {
  return buffer.readInt16LE(dataSize(indexContainer, 2));
}
function UINT_32(buffer, indexContainer) {
  return buffer.readUInt32LE(dataSize(indexContainer, 4));
}
function DATE_TIME(buffer, indexContainer) {
  const zipDate = UINT_32(buffer, indexContainer);
  return decodeDate(zipDate);
}
function current_date_time() {
  return new Date();
}
function dataProcess(type, mul, div) {
  return function (buffer, indexContainer) {
    let result = type(buffer, indexContainer) || 0;
    if (mul != null) {
      result = result * mul;
    }
    if (div) {
      result = result / div;
    }
    return result;
  }
}
function probeState(buffer, indexContainer) {
  let stateDate = UINT_32(buffer, indexContainer);
  const res = {};
  ErrorFlags.forEach(flag => {
    if (stateDate & 1) {
      res[flag] = true;
    }
    stateDate = stateDate >> 1;
  });
  res.count = stateDate;
  return res;
}

const HEADStruct = {
  pipe:       UINT_8,
  rssi:       INT_8, 
  pack_type:  UINT_8,
  num:        UINT_8,
  serverDate: current_date_time
}
const DHTStruct = {
  temp:       dataProcess(INT_16, undefined, 10),
  hum:        dataProcess(UINT_16, undefined, 10),
  date:       DATE_TIME,
  bat_v:      dataProcess(UINT_8, undefined, 10),
  core_t:     UINT_8
}
const UIDStruct = {
  UID:        UINT_32,
}
const StateStruct = {
  state:      probeState,
}

const TYPES_MAP = {
  1: UIDStruct,
  2: DHTStruct,
  3: UIDStruct,
  10: StateStruct
}

function getBody(buffer, result, dataType, indexContainer) {
  if (dataType) {
    Object.keys(dataType).forEach(key => {
      result[key] = dataType[key](buffer, indexContainer);
    });  
  }
}

const MIN_PACKET_SIZE = 16;

function getData(buffer, indexContainer) {
  const data = {};
  const startIndex = indexContainer.index;
  getBody(buffer, data, HEADStruct, indexContainer);
  getBody(buffer, data, TYPES_MAP[data.pack_type], indexContainer);
  indexContainer.index = startIndex + MIN_PACKET_SIZE;
  return data;
}

function pipePad(pipe, size) {
  var sign = Math.sign(pipe) === -1 ? '-' : '';
  return sign + new Array(size).concat([Math.abs(pipe)]).join('0').slice(-size);
}

function getPackTitle(packData) {
  let result = `${packData.serverDate.toJSON()} | NUM: ${packData.num} | Pipe: ${pipePad(packData.pipe, 3)} | RSSI: ${packData.rssi} | TYPE: ${packData.pack_type}`;
  switch (packData.pack_type) {
    case 1:
      result = `${result} | UID: ${packData.UID}`;
      break;
    case 2:
      result = `${result} | BAT: ${packData.bat_v.toFixed(1)} | CORE: ${pipePad(packData.core_t, 2)} | TEMP: ${packData.temp.toFixed(1)} | HUM: ${packData.hum.toFixed(1)}`;
      break;
  }
  return `${result} %s`;
}

function toByteArray(_x) {
  let bytes = [], x = _x;
  if (!x && typeof x === 'number') {
    bytes = [0];
  } 
  while (x) {
    bytes.push(x & 255);
    x = x >> 8;
  };
  return bytes;
};
function getArray(n) {
  res = [];
  for (let i = 0; i < n; i++) {
    res.push(0);
  }
  return res;
};

function convertObjectToArray(data) {
  let packet;
  if (data instanceof Array) {
    packet = [];
    data.map(n => toByteArray(n)).forEach(a => packet = [].concat(packet, a));
  } else {
    packet = data;
  }
  if (packet.length < 8) {
    packet = [].concat(packet, getArray(8 - packet.length));
  }
  return packet;
}

async function getStationPortName() {
  const manufacturer = 'STMicroelectronics.111';
  return new Promise((resolve, reject) => {
    SerialPort.list((error, ports) => {
      if (error) {
        reject(error);
        return;
      }
      const stationPort = ports.find(port => port.manufacturer === manufacturer);
      if (stationPort) {
        resolve(stationPort.comName);
        return;
      }
      reject('Station port not found.');
    });  
  });
}

function SerialConnector(options) {
  this.options = options;
  this.events = new EventEmitter();
  this.connectPort();
}

SerialConnector.prototype.connectPort = async function() {
  let portNum;
  try {
    portNum = await getStationPortName();
  } catch(error) {
    console.log('Serial connection error:', error);
    this.retryToConnect();
    return;
  }
  const comConnection = new SerialPort(portNum, this.options);
  comConnection.on('error', error => {
    console.error('Serial connection error:', error);
    if (error.disconnected || !this.connection) {
      if (this.connection) {
        this.connection.removeAllListeners();
        this.connection = undefined;
      } else {
        comConnection.removeAllListeners();
      }
      this.retryToConnect();
    }
  });
  comConnection.on('open', () => {
    console.log(`Port ${portNum} connected.`);
    comConnection.on('data', this.processReadData.bind(this));
    this.connection = comConnection;
    if (this.timerID) {
      clearInterval(this.timerID);
      this.timerID = undefined;
    }
    this.events.emit('connected');
  });
  comConnection.on('close', () => {
    console.log(`Port ${portNum} closed.`);
    this.connection.removeAllListeners();
    this.connection = undefined;
    this.retryToConnect();
    this.events.emit('disconnected');
  });
}

SerialConnector.prototype.retryToConnect = function() {
  if (this.timerID) {
    return;
  }
  this.timerID = setInterval(() => {
    this.connectPort();
  }, 5000);
}

SerialConnector.prototype.processReadData = function(buffer) {
  if (!this.readCallback) {
    console.error('Serial read error: no data handler.');
    return;
  }
  if (buffer.length < MIN_PACKET_SIZE) {
    console.error('Serial data error', buffer);
    return;
  }

  const dCount = Math.round(buffer.length/MIN_PACKET_SIZE);
  if (dCount !== buffer.length/MIN_PACKET_SIZE) {
    console.warn(`Part of data incoming:`, buffer);
  }

  let comData = [];

  const bufferStep = { index: 0 };
  while (bufferStep.index < buffer.length) {
    const packData = getData(buffer, bufferStep);
    if (packData.pipe === 1) {
      console.log('--------------------------------------------------------------------------'); 
    }
    console.log(getPackTitle(packData), packData);
    comData.push(packData);  
  }

  debounceData(comData, this.readCallback);
}

SerialConnector.prototype.readData = function(callback) {
  this.readCallback = callback;
}

SerialConnector.prototype.writeData = function(data) {
  if (!this.connection) {
    console.error('Serial data send error: not serial connection');
    return;
  }
  this.connection.write(Buffer.from(data));
}

SerialConnector.prototype.CorrectionData = CorrectionData;
SerialConnector.prototype.convertObjectToArray = convertObjectToArray;

SerialConnector.prototype.decodeDate = decodeDate;
SerialConnector.prototype.encodeDate = encodeDate;

module.exports = function(portNum, options) {
  return new SerialConnector(portNum, options);
};
