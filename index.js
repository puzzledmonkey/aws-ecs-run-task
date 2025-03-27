const core = require("@actions/core");
const { ECS, waitUntilTasksStopped } = require("@aws-sdk/client-ecs");

const ecs = new ECS();

const main = async () => {
  const cluster = core.getInput("cluster", { required: true });
  const service = core.getInput("service", { required: true });
  const group = core.getInput("group", { required: true });
  const waitForFinish =
    core.getInput("wait-for-finish", { required: false }) == "true";
  const overrideContainer = core.getInput("override-container", {
    required: false,
  });
  const overrideContainerCommand = core.getMultilineInput(
    "override-container-command",
    { required: false }
  );
  if (group == "service") {
    throw new Error(`Cannot start a group called 'service'`);
  }

  try {
    // Get network configuration from aws directly from describe services
    core.debug("Getting information from service");
    const info = await ecs.describeServices({ cluster, services: [service] });
    if (
      !info ||
      !info.services.find((service) => service.status === "ACTIVE")
    ) {
      // throw new Error(
      //   `Could not find service ${service} in cluster ${cluster}`
      // );
      return;
    }

    const runningService = info.services.find(
      (service) => service.status === "ACTIVE"
    );

    const taskDefinition = runningService.taskDefinition;
    // core.setOutput('task-definition', taskDefinition);

    const taskParams = {
      taskDefinition,
      cluster,
      launchType: runningService.launchType,
      group: group + ":" + service,
    };

    if (runningService.networkConfiguration) {
      taskParams.networkConfiguration = runningService.networkConfiguration;
    }

    if (overrideContainerCommand.length > 0 && !overrideContainer) {
      throw new Error(
        "override-container is required when override-container-command is set"
      );
    }

    if (overrideContainer) {
      if (overrideContainerCommand) {
        taskParams.overrides = {
          containerOverrides: [
            {
              name: overrideContainer,
              command: overrideContainerCommand,
            },
          ],
        };
      } else {
        throw new Error(
          "override-container-command is required when override-container is set"
        );
      }
    }

    core.debug("Running task");
    let task = await ecs.runTask(taskParams);
    const taskArn = task.tasks[0].taskArn;
    // core.setOutput('task-arn', taskArn);

    if (waitForFinish) {
      core.debug("Waiting for task to finish");
      await waitUntilTasksStopped(
        {
          client: ecs,
          maxWaitTime: 6000,
        },
        {
          cluster,
          tasks: [taskArn],
        }
      );

      core.debug("Checking status of task");
      task = await ecs.describeTasks({ cluster, tasks: [taskArn] });
      const exitCode = task.tasks[0].containers[0].exitCode;

      if (exitCode === 0) {
        // core.setOutput('status', 'success');
      } else {
        core.setFailed(task.tasks[0].stoppedReason);

        const taskHash = taskArn.split("/").pop();
        core.info(
          `Task failed, you can check the error on Amazon ECS console: https://console.aws.amazon.com/ecs/home?region=${AWS.config.region}#/clusters/${cluster}/tasks/${taskHash}/details`
        );
      }
    } else {
      // core.setOutput('status', 'success');
    }
  } catch (error) {
    core.setFailed(error);
  }
};

main();
