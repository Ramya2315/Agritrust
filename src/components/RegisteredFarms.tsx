import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Leaf, Users, MapPin, Search, Lock, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RegisteredFarmsProps {
  onNavigate: (page: string) => void;
}

export default function RegisteredFarms({ onNavigate }: RegisteredFarmsProps) {
  const [stats, setStats] = useState({ totalFarmers: 0, totalFarms: 0 });
  const [farms, setFarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, farmsRes] = await Promise.all([
          fetch("/api/stats/farms"),
          fetch("/api/farms/public")
        ]);
        const statsData = await statsRes.json();
        const farmsData = await farmsRes.json();
        setStats(statsData);
        setFarms(farmsData);
      } catch (error) {
        console.error("Failed to fetch registered farms data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredFarms = farms.filter(farm => 
    farm.cropType.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (farm.farmerName && farm.farmerName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="pt-32 pb-20 px-4 min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full text-green-700 text-sm font-bold uppercase tracking-wider border border-green-100 mb-6"
          >
            <Leaf className="h-4 w-4" /> Global Registry
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-black text-gray-900 mb-6">Registered Organic Farms</h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            Transparent access to every verified organic farm in our network. 
            Empowering consumers with blockchain traceability.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <Card className="border-none shadow-xl bg-gradient-to-br from-green-600 to-green-700 text-white overflow-hidden relative">
            <div className="absolute right-0 top-0 opacity-10 translate-x-1/4 -translate-y-1/4">
              <Users className="w-64 h-64" />
            </div>
            <CardContent className="pt-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                  <Users className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold">Verified Farmers</h3>
              </div>
              <div className="text-5xl font-black mb-2">{stats.totalFarmers.toLocaleString()}</div>
              <p className="text-green-100">Active producers using AgriTrustra</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white overflow-hidden relative">
            <div className="absolute right-0 top-0 opacity-10 translate-x-1/4 -translate-y-1/4">
              <MapPin className="w-64 h-64" />
            </div>
            <CardContent className="pt-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                  <MapPin className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold">Registered Plots</h3>
              </div>
              <div className="text-5xl font-black mb-2">{stats.totalFarms.toLocaleString()}</div>
              <p className="text-blue-100">Total verified land units</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter Section */}
        <div className="mb-12 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input 
              placeholder="Search by crop or farmer..." 
              className="pl-10 h-12 rounded-xl"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="text-sm font-medium text-gray-500">
            Showing {filteredFarms.length} results
          </div>
        </div>

        {/* Farm List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 animate-pulse rounded-2xl" />
            ))
          ) : filteredFarms.length > 0 ? (
            filteredFarms.map((farm, index) => (
              <motion.div
                key={farm._id || index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card 
                  className="group hover:shadow-2xl transition-all duration-300 border-none shadow-md overflow-hidden cursor-pointer"
                  onClick={() => onNavigate("auth")}
                >
                  <div className="relative h-48">
                    <img 
                      src={`https://images.unsplash.com/photo-1500382017468-9049fee74a62?auto=format&fit=crop&q=80&w=800`} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      alt={farm.cropType}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-4 left-4">
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white ${
                        farm.status === 'certified' ? 'bg-green-500' : 'bg-yellow-500'
                      }`}>
                        {farm.status === 'certified' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {farm.status.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xl font-bold flex justify-between items-center capitalize">
                      {farm.cropType} Farm
                      <Lock className="h-4 w-4 text-gray-400" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Users className="h-4 w-4" />
                        <span>Farmer: <span className="text-gray-900 font-medium">{farm.farmerName || "Registered Farmer"}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <MapPin className="h-4 w-4" />
                        <span>Coordinates: <span className="text-gray-900 font-medium">{farm.location.lat.toFixed(2)}, {farm.location.lng.toFixed(2)}</span></span>
                      </div>
                      
                      <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-green-700 font-bold text-sm">
                        <span>Unlock for Details</span>
                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          ) : (
            <div className="col-span-full text-center py-20 bg-white rounded-2xl border-2 border-dashed border-gray-100">
              <Leaf className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No farms matched your search</h3>
              <p className="text-gray-500">Try adjusting your filters or search terms.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
