import React, { useEffect, useState } from 'react';
import { DualArcProgressGauge } from '../components/ui/DualArcProgressGauge';
import { useChartColors } from '../hooks/useChartColors';

const DualArcProgressGaugeTest: React.FC = () => {
  const colors = useChartColors();
  const [outerPercentage, setOuterPercentage] = useState(75);
  const [innerPercentage, setInnerPercentage] = useState(45);
  const [isAnimating, setIsAnimating] = useState(false);

  // Demo animation that cycles through different values
  useEffect(() => {
    if (!isAnimating) return;

    const outerValues = [75, 25, 50, 90, 100, 0];
    const innerValues = [45, 80, 30, 60, 75, 20];
    let currentIndex = 0;

    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % outerValues.length;
      setOuterPercentage(outerValues[currentIndex]);
      setInnerPercentage(innerValues[currentIndex]);
    }, 2000);

    return () => clearInterval(interval);
  }, [isAnimating]);

  const handleOuterSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOuterPercentage(Number(e.target.value));
  };

  const handleInnerSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInnerPercentage(Number(e.target.value));
  };

  const toggleAnimation = () => {
    setIsAnimating(!isAnimating);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-xl"
      style={{ backgroundColor: '#1e1e1e' }}
    >
      <div className="text-center space-y-xl">
        <h1 className="text-4xl font-bold text-white">
          Dual Arc Progress Gauge
        </h1>

        {/* Main component showcase */}
        <div className="space-y-xl">
          <DualArcProgressGauge
            outerPercentage={outerPercentage}
            innerPercentage={innerPercentage}
            label="1h"
            size={160}
            displayMode="both"
          />

          {/* Controls */}
          <div className="space-y-md">
            <div className="flex flex-col items-center space-y-xs">
              <label className="text-white text-sm font-medium">
                Outer Arc: {outerPercentage.toFixed(1)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="0.5"
                value={outerPercentage}
                onChange={handleOuterSliderChange}
                disabled={isAnimating}
                className="w-64 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${outerPercentage}%, #374151 ${outerPercentage}%, #374151 100%)`,
                }}
              />
            </div>

            <div className="flex flex-col items-center space-y-xs">
              <label className="text-white text-sm font-medium">
                Inner Arc: {innerPercentage.toFixed(1)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="0.5"
                value={innerPercentage}
                onChange={handleInnerSliderChange}
                disabled={isAnimating}
                className="w-64 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${innerPercentage}%, #374151 ${innerPercentage}%, #374151 100%)`,
                }}
              />
            </div>

            <button
              onClick={toggleAnimation}
              className="px-md py-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              {isAnimating ? 'Stop Animation' : 'Start Demo Animation'}
            </button>
          </div>
        </div>

        {/* Multiple examples */}
        <div className="mt-16">
          <h2 className="text-2xl font-semibold text-white">Examples</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-xl">
            <div className="text-center">
              <DualArcProgressGauge
                outerPercentage={25}
                innerPercentage={35}
                label="15m"
                size={120}
                displayMode="average"
              />
              <p className="text-gray-400 text-sm">Low Progress</p>
            </div>

            <div className="text-center">
              <DualArcProgressGauge
                outerPercentage={66.7}
                innerPercentage={55}
                label="2h"
                size={120}
                progressColor={colors.warning}
                displayMode="average"
              />
              <p className="text-gray-400 text-sm">
                Medium Progress (Orange)
              </p>
            </div>

            <div className="text-center">
              <DualArcProgressGauge
                outerPercentage={95}
                innerPercentage={80}
                label="1d"
                size={120}
                progressColor={colors.destructive}
                displayMode="average"
              />
              <p className="text-gray-400 text-sm">High Progress (Red)</p>
            </div>
          </div>
        </div>

        {/* Different sizes */}
        <div className="mt-16">
          <h2 className="text-2xl font-semibold text-white">
            Different Sizes
          </h2>
          <div className="flex items-center justify-center space-x-xl">
            <div className="text-center">
              <DualArcProgressGauge
                outerPercentage={75}
                innerPercentage={60}
                label="S"
                size={80}
                displayMode="average"
              />
              <p className="text-gray-400 text-xs">Small (80px)</p>
            </div>

            <div className="text-center">
              <DualArcProgressGauge
                outerPercentage={75}
                innerPercentage={50}
                label="M"
                size={120}
                displayMode="average"
              />
              <p className="text-gray-400 text-xs">Medium (120px)</p>
            </div>

            <div className="text-center">
              <DualArcProgressGauge
                outerPercentage={75}
                innerPercentage={85}
                label="L"
                size={160}
                displayMode="average"
              />
              <p className="text-gray-400 text-xs">Large (160px)</p>
            </div>

            <div className="text-center">
              <DualArcProgressGauge
                outerPercentage={75}
                innerPercentage={90}
                label="XL"
                size={200}
                displayMode="average"
              />
              <p className="text-gray-400 text-xs">Extra Large (200px)</p>
            </div>
          </div>
        </div>

        {/* Separate Arc Colors */}
        <div className="mt-16">
          <h2 className="text-2xl font-semibold text-white">
            Separate Arc Colors
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-xl">
            <div className="text-center">
              <DualArcProgressGauge
                outerPercentage={75}
                innerPercentage={85}
                label="Multi"
                size={120}
                outerProgressColor="#22c55e"
                innerProgressColor="#8b5cf6"
                displayMode="both"
              />
              <p className="text-gray-400 text-sm">Green + Purple</p>
            </div>

            <div className="text-center">
              <DualArcProgressGauge
                outerPercentage={60}
                innerPercentage={45}
                label="Dual"
                size={120}
                outerProgressColor="#f59e0b"
                innerProgressColor="#ec4899"
                displayMode="both"
              />
              <p className="text-gray-400 text-sm">Orange + Pink</p>
            </div>

            <div className="text-center">
              <DualArcProgressGauge
                outerPercentage={90}
                innerPercentage={70}
                label="Color"
                size={120}
                outerProgressColor="#06b6d4"
                innerProgressColor="#10b981"
                displayMode="both"
              />
              <p className="text-gray-400 text-sm">Cyan + Emerald</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DualArcProgressGaugeTest;
