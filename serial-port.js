const SerialPort = require('serialport');
const Buffer = require('buffer').Buffer;

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

const TYPES_MAP = {
  1: UIDStruct,
  2: DHTStruct,
  3: UIDStruct
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
      result = `${result} | BAT: ${packData.bat_v} | CORE: ${packData.core_t} | TEMP: ${packData.temp} | HUM: ${packData.hum}`;
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

module.exports = function(portNum,options) {
  const port = new SerialPort(portNum,options);
  port.on('error', function(error) {
    console.log('COM port error:', error);
  });
  port.on('open', () => {
    console.log(portNum, 'connected');
  });
  port.on('close', () => {
    console.log(portNum, 'closed');
  });
  return {
    readData: function(callback) {
      port.on('data', function (buffer) {
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
          console.log(getPackTitle(packData), packData);
          if (packData.pipe === 4) {
            console.log('--------------------------------------------------------------------------'); 
          }
          comData.push(packData);  
        }

        debounceData(comData, callback);
      });        
    },
    writeData: function(data) {
      var buf = Buffer.from(data);
      port.write(buf);
    },
    CorrectionData,
    convertObjectToArray
  }
};
