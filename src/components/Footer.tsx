import React from "react";
import { Leaf, Github, Twitter, Linkedin, Mail } from "lucide-react";

interface FooterProps {
  onNavigate: (page: string) => void;
}

export default function Footer({ onNavigate }: FooterProps) {
  return (
    <footer className="bg-gray-900 text-gray-300 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Leaf className="h-6 w-6 text-green-500" />
              <span className="text-xl font-bold text-white">AgriTrustra</span>
            </div>
            <p className="text-gray-400 max-w-md">
              Empowering farmers through blockchain-verified organic certification and AI-driven crop analysis. 
              Ensuring trust from farm to table.
            </p>
          </div>
          
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><button onClick={() => onNavigate("home")} className="hover:text-green-500 transition-colors">Home</button></li>
              <li><button onClick={() => onNavigate("registered-farms")} className="hover:text-green-500 transition-colors">Registered Farms</button></li>
              <li><button onClick={() => onNavigate("market-prices")} className="hover:text-green-500 transition-colors">Market Prices</button></li>
              <li><button onClick={() => onNavigate("about")} className="hover:text-green-500 transition-colors">About Us</button></li>
              <li><button onClick={() => onNavigate("farmer-dashboard")} className="hover:text-green-500 transition-colors">Farmer Dashboard</button></li>
              <li><button onClick={() => onNavigate("auditor-dashboard")} className="hover:text-green-500 transition-colors">Auditor Portal</button></li>
              <li><button onClick={() => onNavigate("contact")} className="hover:text-green-500 transition-colors">Contact</button></li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Connect</h3>
            <div className="flex gap-4">
              <a href="#" className="p-2 bg-gray-800 rounded-full hover:bg-green-600 transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="p-2 bg-gray-800 rounded-full hover:bg-green-600 transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
              <a href="#" className="p-2 bg-gray-800 rounded-full hover:bg-green-600 transition-colors">
                <Github className="h-5 w-5" />
              </a>
              <a href="#" className="p-2 bg-gray-800 rounded-full hover:bg-green-600 transition-colors">
                <Mail className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-800 mt-12 pt-8 text-center text-sm">
          <p>© {new Date().getFullYear()} AgriTrustra. All rights reserved. Digitally signed by Ministry of Agriculture.</p>
        </div>
      </div>
    </footer>
  );
}
