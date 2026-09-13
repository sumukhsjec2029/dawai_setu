import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bloodBankRouter from "./blood-bank";
import supplyRouter from "./supply";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bloodBankRouter);
router.use(supplyRouter);

export default router;
