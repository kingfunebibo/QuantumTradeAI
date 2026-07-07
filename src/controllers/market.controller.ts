import { Request, Response } from "express";
import { fetchMarkets } from "../services/market.service";

export async function getMarkets(
  _req: Request,
  res: Response
) {
  try {
    const data = await fetchMarkets();

    res.json(data);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch market data.",
    });
  }
}