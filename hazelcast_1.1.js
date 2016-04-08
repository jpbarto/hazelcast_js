/*****
 * Hazelcast.js
 * A javascript library designed to parse the serialized data retruned 
 * by the in-memory cache Hazelcast via its REST interface.
 * 
 * NOTE: This has not been extensively tested and the data formats
 * of the serialized objects are not well documented by the vendor.
 * As such the library's interpretation of the returned serialized
 * objects MAY BE WRONG!  You've been warned.
 *
 * Author: Jason Barto
 * Created: 8 Oct 2014
 * Updated: 5 Feb 2015
 * Version: 1.1
 */

var __JAVA_STREAM_MAGIC__ = 0xaced;
var __JAVA_TC_NULL__ = 0x70;
var __JAVA_TC_REFERENCE__ = 0x71;
var __JAVA_TC_CLASSDESC__ = 0x72;
var __JAVA_TC_OBJECT__ = 0x73;
var __JAVA_TC_STRING__ = 0x74;
var __JAVA_TC_ARRAY__ = 0x75;
var __JAVA_TC_CLASS__ = 0x76;
var __JAVA_TC_BLOCKDATA__ = 0x77;
var __JAVA_TC_ENDBLOCKDATA__ = 0x78;
var __JAVA_TC_RESET__ = 0x79;
var __JAVA_TC_BLOCKDATALONG__ = 0x7A;
var __JAVA_TC_EXCEPTION__ = 0x7B;
var __JAVA_TC_LONGSTRING__ =  0x7C;
var __JAVA_TC_PROXYCLASSDESC__ =  0x7D;
var __JAVA_TC_ENUM__ =  0x7E;

function __as_bytes__ (data, start, stop) {
  var ret = 0;
  var byteData = data.substr (start, stop);

  for (var i = 0; i < byteData.length; i++) {
    ret <<= 8;
    ret += byteData.charCodeAt(i);
  }

  return ret;
}

function HazelcastObjectFactory (hazelcastIp, hazelcastPort) {
  this.baseUrl = 'http://'+ hazelcastIp +':'+ hazelcastPort +'/hazelcast/rest';
}

HazelcastObjectFactory.prototype.__get_xhr__ = function (url) {
  var ret = new XMLHttpRequest ();
  ret.overrideMimeType('text/plain; charset=x-user-defined');
  ret.open ('get', url, false);
  ret.send ();
  return ret;
}

HazelcastObjectFactory.prototype.readMapValue = function (mapName, key) {
  var url = this.baseUrl +'/maps/'+ mapName +'/'+ key;
  var rqst = this.__get_xhr__ (url);
  return new HazelcastObject (rqst.response);
}

function HazelcastObject (objectData) {
  this.objectData = objectData;
  this.dataCursor = 0;
  this.streamVersion = 0;

  this.packageName = '';
  this.className = '';

  if (! __as_bytes__ (objectData, dataCursor, 2) == __JAVA_STREAM_MAGIC__) {
    throw "Could not determine Java serialization magic number"
  }
  this.dataCursor += 2;
  this.streamVersion = __as_bytes__ (objectData dataCursor, 2);

  var classnameLength = this.isSerialObject (objectData);
  if (! classnameLength) {
    throw "Unknown object header type";
  }

  this.dataCursor = 12;
  var fqcn = this.objectData.substr (this.dataCursor, classnameLength);
  this.packageName = fqcn.substr (0, fqcn.lastIndexOf ('.'));
  this.className = fqcn.substr (fqcn.lastIndexOf('.') + 1);
  this.dataCursor += classnameLength;
}

HazelcastObject.prototype.getObjectData = function () {
  return this.objectData;
}

HazelcastObject.prototype.getDataCursor = function () {
  return this.dataCursor;
}

HazelcastObject.prototype.getPackageName = function () {
  return this.packageName;
}

HazelcastObject.prototype.getClassName = function () {
  return this.className;
}

HazelcastObject.prototype.isSerialObject = function (data) {
  if (data.length < 12) {
    return false;
  }

  h1 = data.substr(0, 6);
  h2 = data.substr (6, 4);
  h3 = data.substr (10, 2);

  h1n = __as_bytes__ (h1);
  h2n = __as_bytes__ (h2);
  h3n = __as_bytes__ (h3);

  if (h1n == h2n && h1n == h3n) {
    return h1n;
  }

  return false;
}

HazelcastObject.prototype.isStringHeader = function (data) {
  if (data.length < 11) {
    return false;
  }

  h1 = data.substr(0, 5);
  h2 = data.substr (5, 4);
  h3 = data.substr (9, 2);

  h1n = __as_bytes__ (h1);
  h2n = __as_bytes__ (h2);
  h3n = __as_bytes__ (h3);

  if (h1n == h2n && h1n == h3n) {
    return h1n;
  }

  return false;
}

HazelcastObject.prototype.readString = function () {
  var strlen = this.isStringHeader (this.objectData.substr (this.dataCursor));
  if (! strlen) {
    throw "Unexpected data found when looking for string header"
  }

  this.dataCursor += 11;
  var ret = this.objectData.substr (this.dataCursor, strlen);
  this.dataCursor += strlen;

  return ret;
}

HazelcastObject.prototype.readShort = function () {
  var data = this.objectData.substr (this.dataCursor, 2);

  var ret = data.charCodeAt (0) << 8 | data.charCodeAt (1);
  this.dataCursor += 2;

  return ret;
}

HazelcastObject.prototype.readInt = function () {
  var data = this.objectData.substr (this.dataCursor, 4);
  var ret = 0;

  for (var i = 0; i < 4; i++) {
    ret <<= 8;
    ret |= data.charCodeAt (i);
  }
  this.dataCursor += 4;

  return ret;
}

HazelcastObject.prototype.readLong = function () {
  // a hack for converting 8 byte long to a number in JS
  // has to be a better way
  var data = this.objectData.substr (this.dataCursor, 8);
  var ret = 0;

  var numstr = "0x";
  for (var i = 0; i < 8; i++) {
    numstr += (data.charCodeAt (i) & 0xff).toString(16);
  }
  ret = new Number (numstr).valueOf ();
  this.dataCursor += 8;

  return ret;
}

HazelcastObject.prototype.readFloat = function () {
  var data = this.objectData.substr (this.dataCursor, 4);

  var f32 = new Float32Array (1);
  var bytes = new Uint8Array (f32.buffer);

  for (var i = 0; i < 4; i++) {
    bytes[i] = data.charCodeAt (4 - i) & 0xff;
  }
 
  // sign is the leading bit 
  var sign = bytes[3] >> 7;
  // exponent is the next 8 bits
  var exp = ((bytes[3] & 0x7f) << 7 | bytes[2] >> 7) - 0x7f;
  // mantissa is the remaining 23 bits
  bytes[3] = 0x3f;
  bytes[2] |= 0x80;
  var mantissa = f32[0];

  var ret = mantissa * Math.pow (2, exp);
  if (sign > 0) ret *= -1;

  this.dataCursor += 4;

  return ret;
}


/**
 * God bless Stackoverflow:
 * http://stackoverflow.com/questions/9383593/extracting-the-exponent-and-mantissa-of-a-javascript-number
 */
HazelcastObject.prototype.readDouble = function () {
  var data = this.objectData.substr (this.dataCursor, 8);

  var f64 = new Float64Array (1);
  var bytes = new Uint8Array (f64.buffer);

  for (var i = 0; i < 8; i++) {
    bytes[i] = data.charCodeAt (7-i) & 0xff;
  }

  // sign is the leading bit
  var sign = bytes[7] >> 7;
  // exponent is the next 11 bits
  var exp = ((bytes[7] & 0x7f) << 4 | bytes[6] >> 4) - 0x3ff;
  // mantissa is the remaining 53 bits
  bytes[7] = 0x3f;
  bytes[6] |= 0xf0;
  var mantissa = f64[0];

  var ret = mantissa * Math.pow (2, exp);  
  if (sign > 0) ret *= -1;

  this.dataCursor += 8;

  return ret;
}

HazelcastObject.prototype.readObject = function () {
  var data = this.objectData.substr (this.dataCursor + 5);
  if (! this.isSerialObject (data)) {
    throw "Unexpected data found while looking for object header"
  }

  var ret = new HazelcastObject (data);
  this.dataCursor = this.objectData.length;
  return ret;
}
