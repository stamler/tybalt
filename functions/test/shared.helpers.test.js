const sinon = require('sinon');

exports.stubFirebaseToken = "eyREALTOKENVALUE";

exports.makeResObject = () => { 
  return { 
    header: sinon.spy(), status: sinon.stub().returnsThis(), 
    send: sinon.stub().returnsThis() 
  }; 
};

exports.makeReqObject = (options={}) => {
  const { authType='Bearer', method='POST', token=null, contentType='application/json', body={} } = options;
  const getStub = sinon.stub();
  getStub.withArgs('Content-Type').returns(contentType);
  if (token) {
    getStub.withArgs('Authorization').returns(`${authType} ${token}`);
  }
  return { method:method, body: body, get: getStub };
};

// Stub out db = admin.firestore()
exports.makeFirestoreStub = (options={}) => {
  const {
    writeFail = false,
    userMatches = 0,
    computerExists = false,
    retrievedDate = new Date(1546300800000), // Jan 1, 2019 00:00:00 UTC
    certStrings = null
  } = options;

  // Stub get() method from a DocumentReference obj mocking the azure cache doc
  const getAzureDocSnapStub = sinon.stub();
  if (certStrings) {
    getAzureDocSnapStub.withArgs('retrieved').returns({toDate: function () {return retrievedDate}}); 
    getAzureDocSnapStub.withArgs('certificates').returns(certStrings);  
  } else {
    getAzureDocSnapStub.returns(undefined);
  }

  // A DocumentReference obj mocking behaviour needed for the azure cache doc
  const docRef = {
    get: sinon.stub().resolves({ get: getAzureDocSnapStub }),
    set: sinon.stub().resolves()
  };

  const computerRef = {
    get: sinon.stub().resolves({ exists: computerExists }),
  };

  // Stub the doc() method in a DocumentCollection object
  const docStub = sinon.stub();
  docStub.withArgs('azure').returns(docRef);
  docStub.withArgs('SN123,manufac').returns(computerRef);
  docStub.withArgs('f25d2a25').returns(docRef);
  docStub.withArgs('azure').returns(docRef);
  docStub.returns({
    // default to simulate "generating" a new document reference to call set()
    set: writeFail ? sinon.stub().throws(new Error("can't write to firestore")) : sinon.stub()
  });

  const collectionStub = sinon.stub();
  collectionStub.withArgs('Cache').returns({doc: docStub})
  collectionStub.returns({
    doc: docStub,
    where: sinon.stub().returns({
      get: sinon.stub().resolves({
        // derive size of Array from userMatches
        size:userMatches, 
        docs: Array(userMatches).fill({ ref:{ get: sinon.stub()} }) })
    })
  });

  const setStub = writeFail ? sinon.stub().throws(new Error("can't write to firestore")) : sinon.stub();
  const commitStub = sinon.stub();
  const batchStub = sinon.stub();
  batchStub.returns({ set: setStub, commit: commitStub });

  return {
    collection: collectionStub, 
    batch: batchStub,
    batchStubs: {
      set: setStub,
      commit: commitStub
    }
  };
};

exports.stripTimestamps = (obj) => {
  const { created, updated, time, ...noTimestamps} = obj;
  return noTimestamps; 
}

// Stub out functions in admin.auth()
// See https://github.com/firebase/firebase-admin-node/issues/122#issuecomment-339586082
exports.makeAuthStub = (options={}) => {
  const {uidExists = true, emailExists = false, otherError = false} = options;
  const userRecord = {uid: '678', displayName: 'Testy Testerson', email:"ttesterson@company.com"};
  let authStub;
  const customTokenStub = sinon.stub();
  customTokenStub.withArgs(userRecord.uid).returns(this.stubFirebaseToken);
  if (emailExists) {
    authStub = sinon.stub().returns({
      updateUser: sinon.stub().throws({code: 'auth/email-already-exists'}),
      createUser: sinon.stub().throws({code: 'auth/email-already-exists'}),
      createCustomToken: sinon.stub(),
      listUsers: sinon.stub()  });
  } else if (otherError) {
    authStub = sinon.stub().returns({
      updateUser: sinon.stub().throws({code: 'auth/something-else'}),
      createUser: sinon.stub().throws({code: 'auth/something-else'}),
      createCustomToken: sinon.stub(),
      listUsers: sinon.stub()  });
  } else {
    authStub = sinon.stub().returns({
      updateUser: uidExists ? sinon.stub().returns(userRecord) : sinon.stub().throws({code: 'auth/user-not-found'}),
      createUser: uidExists ? sinon.stub().throws({code: 'auth/uid-already-exists'}) : sinon.stub().returns(userRecord),
      createCustomToken: customTokenStub,
      listUsers: sinon.stub()  });
  }
  return function getterFn(){ return authStub; }
};
