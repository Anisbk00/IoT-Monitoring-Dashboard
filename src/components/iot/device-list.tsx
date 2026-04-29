'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Cpu } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import type { Device } from '@/lib/types';
import { DeviceCard } from './device-card';
import { AddDeviceDialog } from './add-device-dialog';
import { DeviceDetailDialog } from './device-detail-dialog';

export function DeviceList() {
  const { devices } = useAppStore();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleDeviceClick = (device: Device) => {
    setSelectedDevice(device);
    setDetailOpen(true);
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Devices</h2>
            <p className="text-sm text-muted-foreground">
              {devices.length} device{devices.length !== 1 ? 's' : ''} registered
            </p>
          </div>
          <Button
            onClick={() => setAddDialogOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Device
          </Button>
        </div>

        {devices.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Card className="border-dashed border-2 bg-card/30">
              <CardContent className="p-8 md:p-12 flex flex-col items-center justify-center text-center">
                <div className="p-4 rounded-full bg-muted mb-4">
                  <Cpu className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">No devices yet</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                  Register your first IoT device to start monitoring sensor data in real-time.
                </p>
                <Button
                  onClick={() => setAddDialogOpen(true)}
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Your First Device
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            <AnimatePresence mode="popLayout">
              {devices.map((device, i) => (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <DeviceCard device={device} onClick={() => handleDeviceClick(device)} />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Add Device Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: devices.length * 0.05 }}
            >
              <Card
                className="cursor-pointer border-dashed border-2 bg-card/30 hover:bg-card/50 transition-colors h-full"
                onClick={() => setAddDialogOpen(true)}
              >
                <CardContent className="p-4 md:p-5 flex flex-col items-center justify-center min-h-[180px]">
                  <div className="p-3 rounded-full bg-emerald-500/10 mb-2">
                    <Plus className="h-5 w-5 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Add Device</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}
      </div>

      <AddDeviceDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
      <DeviceDetailDialog
        device={selectedDevice}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
}
