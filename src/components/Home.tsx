import React from "react";
import { motion } from "motion/react";
import { ShieldCheck, Leaf, QrCode, Brain, ArrowRight, CheckCircle, Globe, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HomeProps {
  onNavigate: (page: string) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  return (
    <div className="relative min-h-screen">
      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&q=80" 
            className="w-full h-full object-cover"
            alt="Farm Background"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-white"></div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/20 backdrop-blur-md border border-green-500/30 text-green-400 text-sm font-bold mb-6">
              <ShieldCheck className="h-4 w-4" /> Verified by Blockchain & AI
            </div>
            <h1 className="text-6xl md:text-8xl font-black text-white mb-6 tracking-tighter">
              Agri<span className="text-green-500">Trustra</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-200 mb-10 max-w-2xl mx-auto font-medium">
              The world's first decentralized ecosystem for organic certification. 
              Ensuring transparency from soil to soul.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-lg h-14 px-8" onClick={() => onNavigate("auth")}>
                Start Verification <ArrowRight className="ml-2" />
              </Button>
              <Button size="lg" variant="outline" className="bg-white/10 backdrop-blur-md text-white border-white/20 hover:bg-white/20 text-lg h-14 px-8">
                Learn More
              </Button>
            </div>
          </motion.div>
        </div>

        {/* 3D Floating Elements Simulation */}
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-12 opacity-50">
          <motion.div animate={{ y: [0, -20, 0] }} transition={{ duration: 4, repeat: Infinity }} className="p-4 bg-white/10 rounded-2xl backdrop-blur-md">
            <Leaf className="h-12 w-12 text-green-400" />
          </motion.div>
          <motion.div animate={{ y: [0, -30, 0] }} transition={{ duration: 5, repeat: Infinity, delay: 1 }} className="p-4 bg-white/10 rounded-2xl backdrop-blur-md">
            <Brain className="h-12 w-12 text-purple-400" />
          </motion.div>
          <motion.div animate={{ y: [0, -25, 0] }} transition={{ duration: 4.5, repeat: Infinity, delay: 0.5 }} className="p-4 bg-white/10 rounded-2xl backdrop-blur-md">
            <QrCode className="h-12 w-12 text-blue-400" />
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">Our multi-layered verification system combines human expertise with advanced technology.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: <Globe className="h-8 w-8 text-blue-600" />, title: "IoT Geolocation", desc: "Real-time farm mapping and IoT sensor data collection for soil health." },
              { icon: <ShieldCheck className="h-8 w-8 text-green-600" />, title: "Dual Audit", desc: "Two independent auditors verify farm practices and product quality." },
              { icon: <Brain className="h-8 w-8 text-purple-600" />, title: "AI Analysis", desc: "Plant health image analysis and IoT signals support auditor decision-making." }
            ].map((f, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -10 }}
                className="p-8 bg-gray-50 rounded-3xl border border-gray-100 hover:shadow-xl transition-all"
              >
                <div className="mb-6 p-4 bg-white rounded-2xl inline-block shadow-sm">{f.icon}</div>
                <h3 className="text-xl font-bold mb-4">{f.title}</h3>
                <p className="text-gray-600 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-24 bg-green-900 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10">
          <Leaf className="w-full h-full rotate-45" />
        </div>
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold mb-8 leading-tight">
                Blockchain-Backed <br /> 
                <span className="text-green-400">Organic Certificates</span>
              </h2>
              <div className="space-y-6">
                {[
                  "Digital signatures from Ministry of Agriculture",
                  "Immutable blockchain storage for every batch",
                  "Unique QR codes for consumer traceability",
                  "Real-time fraud detection & farm verification"
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="bg-green-500/20 p-1 rounded-full">
                      <CheckCircle className="h-6 w-6 text-green-400" />
                    </div>
                    <span className="text-lg text-gray-200">{text}</span>
                  </div>
                ))}
              </div>
              <Button className="mt-12 bg-white text-green-900 hover:bg-gray-100 h-14 px-8 text-lg font-bold">
                View Sample Certificate
              </Button>
            </div>
            <div className="relative">
              <motion.div
                animate={{ rotate: [0, 5, 0] }}
                transition={{ duration: 6, repeat: Infinity }}
                className="bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/20 shadow-2xl"
              >
                <div className="flex justify-between items-center mb-8">
                  <Leaf className="h-10 w-10 text-green-400" />
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-widest text-gray-400">Certificate ID</div>
                    <div className="font-mono text-sm">AT-2024-8829-X</div>
                  </div>
                </div>
                <div className="space-y-4 mb-8">
                  <div className="h-4 bg-white/20 rounded w-3/4"></div>
                  <div className="h-4 bg-white/20 rounded w-1/2"></div>
                  <div className="h-4 bg-white/20 rounded w-5/6"></div>
                </div>
                <div className="flex justify-center p-4 bg-white rounded-xl">
                  <QrCode className="h-32 w-32 text-gray-900" />
                </div>
                <div className="mt-8 pt-8 border-t border-white/10 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    <span className="text-xs font-bold uppercase">Verified Organic</span>
                  </div>
                  <div className="text-xs text-gray-400 italic">Digitally Signed</div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
