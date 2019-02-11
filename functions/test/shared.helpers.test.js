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
    exists = true,
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

  //TODO: stub DocSnaps for doc() arguments slug, userSourceAnchor, and no args
  // Stub the DocumentReference returned by collection().doc()
  const docStub = sinon.stub();
  docStub.withArgs('azure').returns(azureRef);
  docStub.withArgs('SN123,manufac').returns(azureRef);
  docStub.withArgs('f25d2a25').returns(azureRef);
  docStub.returns(azureRef);

  const collectionStub = sinon.stub();
  collectionStub.withArgs('Cache').returns({doc: docStub})
  collectionStub.returns({
    doc: docStub,
    where: sinon.stub().returns({
      get: sinon.stub().resolves({ 
        size:1, docs:[{ ref:{ get: sinon.stub().returns({exists: exists}) } }] })
    }),
    add: writeFail? sinon.stub().throws(new Error("can't write to firestore")) : sinon.stub()
  });

  return { 
    collection: collectionStub, 
    batch: sinon.stub().returns({
      set: sinon.stub(),
      update: sinon.stub(),
      commit: sinon.stub()
    }) 
  };
};
