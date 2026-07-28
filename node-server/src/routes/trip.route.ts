import express from 'express';
import { pinStop } from '../controllers/stops.controller';
import { startTrip, endTrip, getStops, getTripEta } from '../controllers/trip.controller';

const router = express.Router();


router.post ('/start-trip',        startTrip);
router.patch("/end-trip/:tripId",  endTrip);
router.post ("/:tripId/pin-stop",  pinStop);
router.get  ("/:tripId/stops",     getStops);
router.get  ("/:tripId/eta",       getTripEta);

export default router;