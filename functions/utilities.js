/* 
  Returns an object containing any properties in validProps and
  all properties in requiredProps. Errors if any required properties 
  are missing unless addRequiredNulls is true. Errors if any 
  required properties have null values unless allowRequiredNulls is true.

  Errors if allowRequiredNulls=false while addRequiredNulls=true
*/

exports.filterProperties = function (data, options={}) {

  // Get options and fall back to defaults using ES6 destructuring assignment
  // booleans preserve valid null-valued properties, allow null-valued 
  // required properties, and add null property if required property missing
  const { valid = [], required = [], stripValidNulls = false,
    allowRequiredNulls = false, addRequiredNulls = false } = options;

  // allowRequiredNulls is const so use a mutable internal variable 
  // to force a change in the invalid state tested next
  let _allowRequiredNulls = allowRequiredNulls;
  if (!allowRequiredNulls && addRequiredNulls) {
    // addRequiredNulls necesitates allowRequiredNulls
    _allowRequiredNulls = true;
  }

  // Valid properties are a superset of required properties. Eliminate overlap
  let _requiredSet = new Set(required);  
  let _validSet = new Set(valid.filter(x => !_requiredSet.has(x)));
  
  let filteredObject = {} 

  // Handle required properties
  for (let field of _requiredSet) {
    if (data.hasOwnProperty( field )) {
      if ( data [ field ] !== null || _allowRequiredNulls ) {
        filteredObject [ field ] = data [ field ];
      } else {
        throw new Error(`required property ${field} is null`);
      }
    }
    else if (addRequiredNulls) {
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

// create a serial,mfg identifier slug
exports.makeSlug = function (serial, mfg) {
  return serial.trim() + ',' + mfg.toLowerCase().replace('.','').replace(',','')
    .replace('inc','').replace('ltd','').trim().replace(' ','_');
}
