const sinon = require('sinon');

exports.makeResObject = () => { 
  return { 
    header: sinon.spy(), status: sinon.stub().returnsThis(), 
    send: sinon.stub().returnsThis() 
  }; 
};

exports.makeReqObject = (options={}) => {
  const { method = 'POST', token = null, contentType = 'application/json' } = options;
  req = { 
    method:method, body: {}, 
    get: sinon.stub().withArgs('Content-Type').returns(contentType)
  };
  if (token) { req.body.id_token = token }
  return req;
};
