/* 
  Returns an object containing any properties in validProps and all properties in requiredProps. 
  Errors if any required properties are missing unless allowAndAddRequiredNulls is true. 
  Errors if any required properties have null if allowAndAddRequiredNulls is false.
  Preserves null-values for required properties by default
  removes otherwise valid null properties if stripValidNulls is true

  TODO: validate actual values with, for example, RegExes
*/
exports.filterProperties = function (data, options={}) {

  // Get options and fall back to defaults using ES6 destructuring assignment
  // booleans preserve valid null-valued properties, allow null-valued 
  // required properties, and add null property if required property missing
  const { valid = [], required = [], stripValidNulls = false,
    allowAndAddRequiredNulls = undefined } = options;

  // Valid properties are a superset of required properties. Eliminate overlap
  let _requiredSet = new Set(required);  
  let _validSet = new Set(valid.filter(x => !_requiredSet.has(x)));
  
  let filteredObject = {} 

  // Handle required properties
  for (let field of _requiredSet) {
    if (data.hasOwnProperty( field )) {
      if ( data [ field ] !== null || allowAndAddRequiredNulls !== false ) {
        filteredObject [ field ] = data [ field ];
      } else {
        throw new Error(`required property ${field} is null`);
      }
    }
    else if (allowAndAddRequiredNulls === true) {
      // required field is missing, add null field
      filteredObject [ field ] = null;
    } 
    else {
      // required field is missing, fail
      throw new Error(`required property ${field} is missing`);
    }
  }

  // Handle valid (but not required) properties
  for (let field of _validSet) {
    if ( data.hasOwnProperty( field ) ) {
      if ( data [ field ] === null && stripValidNulls ) { continue; }
      filteredObject [ field ] = data [ field ]
    }
  }

  return filteredObject;
}

// make a string with serial & manufacturer that uniquely identifies a computer
exports.makeSlug = function (serial, mfg) {
  const sc = serial.replace(/\s|\/|,/g,"");
  const mc = mfg.toLowerCase().replace(/\/|\.|,|inc|ltd/gi,"").trim().replace(/ /g,"_")
  if (sc.length>=4 && mc.length>=2 ) {
    return sc + ',' + mc;
  } else {
    throw new Error(`serial ${sc} or manufacturer ${mc} too short`);
  }
}
