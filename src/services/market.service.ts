import axios from "axios";

export async function fetchMarkets() {
  const response = await axios.get(
    "https://api.coingecko.com/api/v3/coins/markets",
    {
      params: {
        vs_currency: "usd",
        order: "market_cap_desc",
        per_page: 50,
        page: 1,
        sparkline: true,
        price_change_percentage: "1h,24h,7d",
      },
    }
  );

  return response.data;
}