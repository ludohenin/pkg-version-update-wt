'use latest';

import Webtask from 'webtask-tools';
import {app} from './src/app';

exports = Webtask.fromExpress(app);
