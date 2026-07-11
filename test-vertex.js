const { VertexAI } = require('@google-cloud/vertexai');
const vertexAI = new VertexAI({ project: 'flash-time-493418-j3', location: 'global', apiEndpoint: 'aiplatform.googleapis.com' });
console.log(vertexAI);
