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
    retrievedDate = new Date(1546300800000), // Jan 1, 2019 00:00:00 UTC
    timestampsInSnapshots = true,
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
  const azureSnap = { get: getSnapStub };
  const azureRef = {
    get: sinon.stub().resolves(azureSnap),
    set: sinon.stub().resolves()
  };

  // Stub the DocumentReference returned by collection().doc()
  const docStub = sinon.stub();
  docStub.withArgs('azure').returns(azureRef); 
  const collectionStub = sinon.stub();
  collectionStub.withArgs('Cache').returns({doc: docStub})

  return {collection: collectionStub };
};
