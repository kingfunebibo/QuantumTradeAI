import { Router } from "express";
import { getMarkets } from "../controllers/market.controller";

const router = Router();

router.get("/", getMarkets);

export default router;