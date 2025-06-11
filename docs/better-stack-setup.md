# Better Stack Metrics Dashboard Setup Guide

This guide explains how to set up Better Stack dashboards to visualize request metrics from your wedding invitation application.

## Prerequisites

1. A Better Stack account (free tier is sufficient)
2. Ensure your BETTERSTACK_SOURCE_TOKEN is set in your environment variables

## Step 1: Verify Logs Are Being Received

1. Log in to your Better Stack account
2. Navigate to the "Sources" section
3. Ensure your application logs are appearing with the following tags:
   - `tags.env_type`: Environment type identifier (`0`, `1`, `2`, `3`)
   - `tags.device_os`: Device operating system (Windows, Android, iOS, MacOS, Linux, Other)
   - `responseTime`: Request response time in milliseconds

## Step 2: Create a Dashboard

1. Go to the "Dashboards" section in Better Stack
2. Click "Create new dashboard"
3. Name it "Wedding Invitation Metrics"

## Step 3: Add Widgets to Your Dashboard

### Device OS Distribution Widget

1. Add a "Pie chart" widget
2. Configure as follows:
   - Query: `tags.device_os:*`
   - Group by: `tags.device_os`
   - Title: "Requests by Device OS"

### Environment Type Distribution Widget

1. Add a "Bar chart" widget
2. Configure as follows:
   - Query: `tags.env_type:*`
   - Group by: `tags.env_type`
   - Title: "Requests by Environment Type"

### Response Time Widget

1. Add a "Line chart" widget
2. Configure as follows:
   - Query: `responseTime:*`
   - Group by: `tags.env_type`
   - Aggregation: average
   - Title: "Average Response Time by Environment"

### Request Volume Widget

1. Add a "Line chart" widget
2. Configure as follows:
   - Query: `"Request completed"`
   - Group by: time (1 hour intervals)
   - Title: "Request Volume Over Time"

## Step 4: Share Your Dashboard

1. Open your "Wedding Invitation Metrics" dashboard
2. Click on "Share" in the upper-right corner
3. Enable the public sharing toggle
4. Copy the generated URL

This public URL can be shared with anyone, and they'll be able to view your metrics without needing a Better Stack account.

## Understanding the Environment Types

- `0`: Default environment - AthiraAndGowtham_Soiree_Wedding_Invitation_Site
- `1`: Athira Weds Gowtham - AthiraWedsGowtham_Wedding_Site
- `2`: Gowtham Weds Athira - GowthamWedsAthira_Site
- `3`: Wedding Invite - Chitta_Wedding_Invite_Site

## Troubleshooting

If you don't see data in your dashboards:

1. Check that the BETTERSTACK_SOURCE_TOKEN environment variable is correctly set
2. Verify logs are being sent in the correct format by examining your application logs
3. Ensure Better Stack is receiving the logs (check Sources section)
4. Make sure you're generating traffic to the application