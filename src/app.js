import bodyParser from 'body-parser';
import express from 'express';
import {verifyRequest} from './utils';
import {anyRoutes, handleEvent, noEventFound} from './routes';


export let app = express();

app.use(bodyParser.json());
app.use(verifyRequest);

app.post('/:org', handleEvent, noEventFound);
app.all('*', anyRoutes);
