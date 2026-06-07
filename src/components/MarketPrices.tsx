import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { BarChart3, Loader2, RefreshCw, Search, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

type MarketItem = {
  category: string;
  product: string;
  commodity?: string;
  variety?: string;
  state?: string;
  district?: string;
  market: string;
  modalPrice?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  modalPricePerKg?: number | null;
  minPricePerKg?: number | null;
  maxPricePerKg?: number | null;
  unit: string;
  date?: string;
  dataMode?: string;
  updatedAt: string;
};

type MarketBoard = {
  updatedAt: string;
  sourceNote: string;
  dataMode?: string;
  categories: string[];
  selectedCategory: string;
  items: MarketItem[];
};

const formatPrice = (value?: number | null) =>
  typeof value === "number"
    ? `Rs ${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
    : "N/A";

const asNumber = (value: any) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toPerKg = (item: MarketItem, perKgValue: any, rawValue: any) => {
  const directValue = asNumber(perKgValue);
  if (directValue !== null) return directValue;

  const numeric = asNumber(rawValue);
  if (numeric === null) return null;

  return item.unit?.toLowerCase().includes("quintal")
    ? Number((numeric / 100).toFixed(2))
    : numeric;
};

const modalPricePerKg = (item: MarketItem) => toPerKg(item, item.modalPricePerKg, item.modalPrice);
const minPricePerKg = (item: MarketItem) => toPerKg(item, item.minPricePerKg, item.minPrice);
const maxPricePerKg = (item: MarketItem) => toPerKg(item, item.maxPricePerKg, item.maxPrice);

const labelForCategory = (category: string) =>
  category === "all" ? "All Items" : category.charAt(0).toUpperCase() + category.slice(1);

export default function MarketPrices() {
  const [board, setBoard] = useState<MarketBoard | null>(null);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchMarketPrices = async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ category });
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/market-prices?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load market prices");
      }
      setBoard(data);
    } catch (err: any) {
      setError(err.message || "Failed to load market prices");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketPrices();
  }, [category]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, MarketItem[]> = {};
    for (const item of board?.items || []) {
      groups[item.category] = [...(groups[item.category] || []), item];
    }
    return groups;
  }, [board]);

  const averagePrice = useMemo(() => {
    const items = board?.items || [];
    if (items.length === 0) return 0;
    return items.reduce((sum, item) => sum + Number(modalPricePerKg(item) || 0), 0) / items.length;
  }, [board]);

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
              <TrendingUp className="h-4 w-4" /> Market Prices
            </div>
            <h1 className="text-3xl font-bold text-gray-950 md:text-4xl">Live Commodity Price Board</h1>
            <p className="mt-2 max-w-2xl text-gray-600">
              View location-wise mandi prices for vegetables, fruits, grains, and pulses in Rs per kg.
            </p>
          </div>
          <Button onClick={fetchMarketPrices} variant="outline" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Items shown</CardDescription>
              <CardTitle>{board?.items.length || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Average modal price</CardDescription>
              <CardTitle>{formatPrice(averagePrice)} / kg</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Last refreshed</CardDescription>
              <CardTitle className="text-base">
                {board?.updatedAt ? new Date(board.updatedAt).toLocaleString() : "Loading"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {(board?.categories || ["all", "vegetables", "fruits", "grains"]).map(item => (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant={category === item ? "default" : "outline"}
                    className={category === item ? "bg-green-600 hover:bg-green-700" : ""}
                    onClick={() => setCategory(item)}
                  >
                    {labelForCategory(item)}
                  </Button>
                ))}
              </div>
              <form
                className="flex w-full gap-2 lg:w-96"
                onSubmit={event => {
                  event.preventDefault();
                  fetchMarketPrices();
                }}
              >
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    className="h-10 pl-9"
                    placeholder="Search item or market"
                  />
                </div>
                <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={isLoading}>
                  Search
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {Object.entries(groupedItems).map(([group, items]) => (
            <motion.div key={group} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2 capitalize">
                      <BarChart3 className="h-5 w-5 text-green-600" /> {group}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {board?.dataMode && (
                        <Badge className={board.dataMode === "live" ? "bg-green-600" : "bg-amber-600"}>
                          {board.dataMode}
                        </Badge>
                      )}
                      <Badge variant="outline">{items.length} locations</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>District</TableHead>
                        <TableHead>Market</TableHead>
                        <TableHead>Price / kg</TableHead>
                        <TableHead>Min / kg</TableHead>
                        <TableHead>Max / kg</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={`${item.category}-${item.product}-${item.market}-${index}`}>
                          <TableCell className="font-semibold capitalize">{item.product}</TableCell>
                          <TableCell>{item.state || "India"}</TableCell>
                          <TableCell>{item.district || "Regional"}</TableCell>
                          <TableCell>{item.market}</TableCell>
                          <TableCell className="font-bold text-green-700">{formatPrice(modalPricePerKg(item))}</TableCell>
                          <TableCell>{formatPrice(minPricePerKg(item))}</TableCell>
                          <TableCell>{formatPrice(maxPricePerKg(item))}</TableCell>
                          <TableCell>{item.date || "Today"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {!isLoading && board?.items.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center text-gray-500">
            No market prices matched your filters.
          </div>
        )}
      </div>
    </div>
  );
}
