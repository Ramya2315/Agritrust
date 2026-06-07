import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, HelpCircle, ShieldCheck, Leaf, Brain, QrCode } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const faqs = [
  {
    question: "How does the AgriTrustra certification process work?",
    answer: "The process involves four major layers of trust: 1. Registration by the farmer. 2. On-site inspection and documentation by Auditor 1. 3. Compliance review by Auditor 2. 4. Scientific validation via our CNN AI model that analyzes crop and soil data.",
    icon: <Leaf className="h-5 w-5 text-green-600" />
  },
  {
    question: "What is the role of AI in the certification?",
    answer: "Our AI model analyzes plant health images and IoT soil data as supporting signals. It detects stress patterns and plant health indicators, but organic certification ultimately depends on three factors: (1) Documented input history (seeds, fertilizers, pesticides), (2) AI and IoT signal compliance, and (3) Auditor field inspection and approval. Healthy plants alone do not guarantee organic status.",
    icon: <Brain className="h-5 w-5 text-purple-600" />
  },
  {
    question: "How are auditors assigned to my farm?",
    answer: "Auditors are assigned based on geographical proximity and specialization. Auditor 1 handles physical inspection, while Auditor 2 performs a secondary independent check to prevent bias or single-point failures in the audit process.",
    icon: <ShieldCheck className="h-5 w-5 text-blue-600" />
  },
  {
    question: "Is the digital certificate legally valid?",
    answer: "Yes, our digital certificates are generated on a secure blockchain layer, making them immutable and verifiable. They comply with modern digital documentation standards.",
    icon: <QrCode className="h-5 w-5 text-amber-600" />
  },
  {
    question: "How can I track my application status?",
    answer: "Once you submit your farm details, you can monitor the 'Certification Pipeline' on your dashboard. You will see real-time status updates as your application moves through the Auditor and AI analysis stages.",
    icon: <HelpCircle className="h-5 w-5 text-indigo-600" />
  }
];

export default function Help() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="pt-32 pb-20 px-4 max-w-4xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <h1 className="text-4xl font-bold text-gray-900 mb-6 tracking-tight">How AgriTrustra Works</h1>
        <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto">
          We bring transparency to organic farming through the synergy of 
          expert auditing, scientific AI analysis, and blockchain technology.
        </p>
      </motion.div>

      <section className="mb-20">
        <h2 className="text-2xl font-bold text-center mb-10 text-green-900">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <Card key={index} className="overflow-hidden border-green-50 shadow-sm hover:shadow-md transition-shadow">
              <button 
                onClick={() => setOpenIndex(index === openIndex ? null : index)}
                className="w-full text-left p-6 flex justify-between items-center bg-white hover:bg-green-50/30 transition-colors"
                aria-expanded={openIndex === index}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-gray-50 rounded-lg">
                    {faq.icon}
                  </div>
                  <span className="font-bold text-gray-800">{faq.question}</span>
                </div>
                <motion.div
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                </motion.div>
              </button>
              
              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <CardContent className="px-6 pb-6 pt-2 text-gray-600 leading-relaxed border-t border-green-50">
                      {faq.answer}
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          ))}
        </div>
      </section>

      <div className="bg-green-900 rounded-3xl p-10 text-white text-center">
        <h3 className="text-2xl font-bold mb-4">Still have questions?</h3>
        <p className="text-green-100 mb-8 max-w-lg mx-auto">
          Our support team is available to help farmers through the registration 
          and verification process step-by-step.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <div className="px-6 py-3 bg-white/10 rounded-xl border border-white/20 backdrop-blur-sm">
            <p className="text-xs text-green-200 uppercase font-bold tracking-wider mb-1">Email Support</p>
            <p className="font-medium">help@agritrustra.in</p>
          </div>
          <div className="px-6 py-3 bg-white/10 rounded-xl border border-white/20 backdrop-blur-sm">
            <p className="text-xs text-green-200 uppercase font-bold tracking-wider mb-1">Phone Number</p>
            <p className="font-medium">1800-419-AGRI</p>
          </div>
        </div>
      </div>
    </div>
  );
}
