const sinon = require('sinon');
const _ = require('lodash');

const userRecordMaster = {uid: '67891011', displayName: 'Testy Testerson', email:"ttesterson@company.com", customClaims: {"admin": true, "standard": true}};
exports.stubFirebaseToken = "eyREALTOKENVALUE";

exports.makeResObject = () => { 
  return { 
    header: sinon.spy(), status: sinon.stub().returnsThis(), 
    send: sinon.stub().returnsThis(), set: sinon.stub() 
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
  docStub.withArgs(userRecordMaster.uid).returns(docRef);
  docStub.returns({
    // default to simulate "generating" a new document reference to call set()
    set: writeFail ? sinon.stub().throws(new Error("set to firestore failed")) : sinon.stub()
  });

  const collectionStub = sinon.stub();
  collectionStub.withArgs("Cache").returns({doc: docStub});
  collectionStub.withArgs("Profiles").returns({doc: docStub});
  collectionStub.returns({
    doc: docStub,
    where: sinon.stub().returns({
      get: sinon.stub().resolves({
        // derive size of Array from userMatches
        size:userMatches, 
        docs: Array(userMatches).fill({ ref:{ get: sinon.stub()} }) })
    })
  });

  const set = sinon.stub();
  const commit = writeFail ? sinon.stub().throws(new Error("commit to firestore failed")) : sinon.stub();
  const batch = sinon.stub();
  batch.returns({ set, commit });

  return {
    collection: collectionStub, 
    batch,
    batchStubs: {
      set,
      commit
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
  const userRecord = _.cloneDeep(userRecordMaster);
  const {uidExists = true, emailExists = false, otherError = false} = options;
  let authStub;

  const createCustomToken = sinon.stub();
  createCustomToken.withArgs(userRecord.uid).returns(this.stubFirebaseToken);

  const listUsers = sinon.stub();
  listUsers.resolves({users: [userRecord]});
  // TODO: build out listUsers with return Promise

  const getUser = sinon.stub();
  getUser.withArgs(userRecord.uid).resolves(userRecord);
  // TODO: build out getUser

  const setCustomUserClaims = sinon.stub();
  // TODO: build out setCustomUserClaims

  if (emailExists) {
    authStub = sinon.stub().returns({
      updateUser: sinon.stub().throws({code: 'auth/email-already-exists'}),
      createUser: sinon.stub().throws({code: 'auth/email-already-exists'}),
      createCustomToken, listUsers, getUser, setCustomUserClaims });
  } else if (otherError) {
    authStub = sinon.stub().returns({
      updateUser: sinon.stub().throws({code: 'auth/something-else'}),
      createUser: sinon.stub().throws({code: 'auth/something-else'}),
      createCustomToken, listUsers, getUser, setCustomUserClaims });
  } else {
    authStub = sinon.stub().returns({
      updateUser: uidExists ? sinon.stub().returns(userRecord) : sinon.stub().throws({code: 'auth/user-not-found'}),
      createUser: uidExists ? sinon.stub().throws({code: 'auth/uid-already-exists'}) : sinon.stub().returns(userRecord),
      createCustomToken, listUsers, getUser, setCustomUserClaims });
  }
  return function getterFn(){ return authStub; }
};
