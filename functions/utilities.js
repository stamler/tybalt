/* 
  Returns an object containing any properties in validProps and
  all properties in requiredProps. Errors if any required properties 
  are missing unless addRequiredNulls is true. Errors if any 
  required properties have null values unless allowRequiredNulls is true.

  Errors if allowRequiredNulls=false whilte addRequiredNulls=true
*/

// TODO: optimize using short-circuit operators?

exports.filterProperties = function (data, options={}) {

  // Get options and fall back to defaults using ES6 destructuring assignment
  // booleans preserve valid null-valued properties, allow null-valued 
  // required properties, and add null property if required property missing
  const { valid = [], required = [], keepValidNulls = true,
    allowRequiredNulls = false, addRequiredNulls = false } = options;

  // Verify args
  if (!allowRequiredNulls && addRequiredNulls) { throw new Error(`bad args`); }

  // Valid properties are a superset of required properties. Eliminate overlap
  let _requiredSet = new Set(required);  
  let _validSet = new Set(valid.filter(x => !_requiredSet.has(x)));
  
  let filteredObject = {} 

  // Handle required properties
  for (let field of _requiredSet) {
    // required field is missing
    let exists = data.hasOwnProperty( field )
    if (!exists && addRequiredNulls) {
      filteredObject [ field ] = null;
      continue;
    } else {
      throw new Error(`required property ${field} is missing`);
    }

    // required field is present but null
    let isNull = data [ field ] === null ? true : false
    if (isNull && allowRequiredNulls) {
      filteredObject [ field ] = null;
      continue;
    } else {
      throw new Error(`required property ${field} is null`);
    }

    // required field is present and not null
    filteredObject [ field ] = data [ field ];
  }

  // Handle valid (but not required) properties
  for (let field of _validSet) {
    if ( data.hasOwnProperty( field ) ) {
      if ( data [ field ] === null && !keepValidNulls ) { continue; }
      filteredObject [ field ] = data [ field ]
    }
  }

  return filteredObject;
}