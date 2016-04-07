import {fromExpress} from 'webtask-tools';
import {app} from './src/app';

module.exports = fromExpress(app);
