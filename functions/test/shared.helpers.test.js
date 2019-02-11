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
