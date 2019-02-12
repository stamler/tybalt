const sinon = require('sinon');

exports.makeResObject = () => { 
  return { 
    header: sinon.spy(), status: sinon.stub().returnsThis(), 
    send: sinon.stub().returnsThis() 
  }; 
};

exports.makeReqObject = (options={}) => {
  const { method='POST', token=null, contentType='application/json', body={} } = options;
  const getStub = sinon.stub();
  getStub.withArgs('Content-Type').returns(contentType);
  getStub.withArgs('Authorization').returns(`Bearer ${token}`);
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
        // TODO: user_matches_returned used to derive number of items in array
        size:userMatches, 
        docs: Array(userMatches).fill({ ref:{ get: sinon.stub()} }) })
    })
  });

  const batchStub = sinon.stub();
  batchStub.returns({
    set: sinon.stub(),
    commit: sinon.stub()
  });

  return { 
    collection: collectionStub, 
    batch: batchStub 
  };
};
