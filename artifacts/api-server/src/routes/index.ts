import { Router, type IRouter } from "express";
import healthRouter from "./health";
import moderateRouter from "./moderate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(moderateRouter);

export default router;
