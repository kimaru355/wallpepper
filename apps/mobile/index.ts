import { registerRootComponent } from 'expo';

import './src/background'; // defines the background task before the app starts
import App from './App';

registerRootComponent(App);
