import React, { useState } from 'react';
// ... other imports

const RewardsPanel = () => {
  // ... existing code

  const effectivePerShare = Math.round(rewardPoints * tierMultiplier(deadlineTier));
  const totalBudget = effectivePerShare * count;
  const handlingFee = totalBudget * 0.1; // Calculate 10% handling fee
  const actualLockedAmount = totalBudget + handlingFee;

  const [isAcknowledged, setIsAcknowledged] = useState(false);

  const handleAcknowledgementChange = () => {
    setIsAcknowledged(!isAcknowledged);
  };

  // ... existing code

  return (
    <div>
      {/* ... existing JSX */}

      <div>
        <h4>Reward Details</h4>
        <p>Reward Subtotal: NT${totalBudget.toLocaleString()}</p>
        <p>Platform Handling Fee (10%): NT${handlingFee.toLocaleString()}</p>
        <p>Actual Locked Amount: NT${actualLockedAmount.toLocaleString()}</p>
      </div>

      <div>
        <input
          type="checkbox"
          id="acknowledge-handling-fee"
          checked={isAcknowledged}
          onChange={handleAcknowledgementChange}
        />
        <label htmlFor="acknowledge-handling-fee">
          I acknowledge that the platform charges a 10% handling fee.
        </label>
      </div>

      {/* ... existing JSX */}

      <Button
        // ... existing props
        disabled={!isAcknowledged}
        // ... existing props
      >
        Publish
      </Button>

      {/* ... existing JSX */}
    </div>
  );
};

export default RewardsPanel;