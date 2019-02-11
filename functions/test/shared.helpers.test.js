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
    userExists = false,
    computerExists = false,
    retrievedDate = new Date(1546300800000), // Jan 1, 2019 00:00:00 UTC
    certStrings = null
  } = options;

  // Stub the DocumentSnapshot returned by DocRef.get()
  const retrieved = {toDate: function () {return retrievedDate}};
  const getSnapStub = sinon.stub();
  if (certStrings) {
    getSnapStub.withArgs('retrieved').returns(retrieved); 
    getSnapStub.withArgs('certificates').returns(certStrings);  
  } else {
    getSnapStub.returns(undefined);
  }

  const azureRef = {
    get: sinon.stub().resolves({ get: getSnapStub }),
    set: sinon.stub().resolves()
  };

  const computerRef = {
    get: sinon.stub().resolves({ exists: computerExists }),
  };

  // Stub the DocumentReference returned by collection().doc()
  const docStub = sinon.stub();
  docStub.withArgs('azure').returns(azureRef);
  docStub.withArgs('SN123,manufac').returns(computerRef);
  docStub.withArgs('f25d2a25').returns(azureRef);
  docStub.withArgs('azure').returns(azureRef);

  const collectionStub = sinon.stub();
  collectionStub.withArgs('Cache').returns({doc: docStub})
  collectionStub.returns({
    doc: docStub,
    where: sinon.stub().returns({
      get: sinon.stub().resolves({ 
        // TODO: control size for both computers and users, derive 'exists' props from this number
        size:1, docs:[{ ref:{ get: sinon.stub().returns({exists: userExists}) } }] })
    }),
    add: writeFail ? sinon.stub().throws(new Error("can't write to firestore")) : sinon.stub()
  });

  const batchStub = sinon.stub();
  batchStub.returns({
    set: sinon.stub(),
    update: sinon.stub(),
    commit: sinon.stub()
  });

  return { 
    collection: collectionStub, 
    batch: batchStub 
  };
};
