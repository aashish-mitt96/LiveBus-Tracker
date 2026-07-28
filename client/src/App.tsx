import User from './pages/User';
import TripMap from './pages/Map';
import Driver from './pages/Driver';

import { BrowserRouter, Routes, Route } from 'react-router-dom';


function App() {

  return (
    <BrowserRouter>
      <Routes>

        <Route path="/"                element={<Driver />} />
        <Route path="/user"            element={<User />} />
        <Route path="/tracker/:tripId" element={<TripMap />} />
      
      </Routes>
    </BrowserRouter>
  );
}

export default App