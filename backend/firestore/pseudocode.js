/*
 This code is an attempt to understand firebase rules in a different way
 It is not to be used in production
*/

if (request.auth.uid == request.resource.data['uid']) {
  if( newDoc().keys().hasAll(["date", "timetype", "uid"]) ) {
    if (isInCollection("timetype","TimeTypes")) {
      if ( newDoc().keys().hasOnly([ "date", "timetype", "uid", "week_ending" ])) {
        if (newDoc().timetype == "OR") {
          return true
        } else {
          // the submitted doc is missing (at least) hours
          return false
        }
      } else {
        // This is not an OR object, do more testing
        /* Do testing of non-OR documents here, starting with time off */
      }
    } else {
      // the submitted doc has an invalid timetype
      return false
    }
  } else {
    // the submitted doc is missing required fields
    return false
  }
} else {
  // the submitted uid is for a different user
  return false
}