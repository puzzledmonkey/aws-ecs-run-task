const core = require('@actions/core');
const AWS = require('aws-sdk');

const ecs = new AWS.ECS();

const main = async () => {
  const cluster = core.getInput('cluster', { required: true });
  const service = core.getInput('service', { required: true });
  const suffix = core.getInput('suffix', { required: true });
  const waitForFinish =
    core.getInput('wait-for-finish', { required: false }) == 'true';
  const stopExisting =
    core.getInput('stop-existing', { required: false }) == 'true';
  const overrideContainer = core.getInput('override-container', {
    required: false,
  });
  const overrideContainerCommand = core.getMultilineInput(
    'override-container-command',
    { required: false }
  );

  try {
    // Get network configuration from aws directly from describe services
    core.debug('Getting information from service...');
    const info = await ecs
      .describeServices({ cluster, services: [service] })
      .promise();

    if (!info || !info.services[0]) {
      throw new Error(
        `Could not find service ${service} in cluster ${cluster}`
      );
    }

    const taskDefinition = info.services[0].taskDefinition;
    // core.setOutput('task-definition', taskDefinition);

    if (stopExisting) {
      const existing = await ecs
        .listTasks({ cluster, family: service + '-' + suffix })
        .promise();
      if (existing && existing.taskArns?.length > 0) {
        core.debug('Stopping ' + existing.taskArns?.length + ' existing tasks');
        existing.taskArns
          .map((e) => e.split('/').pop())
          .forEach((task) => {
            core.debug('Stopping ' + task);
            ecs.stopTask({ cluster, task });
          });
      }
    }

    const taskParams = {
      taskDefinition,
      cluster,
      launchType: info.services[0].launchType,
      group: service + '-' + suffix,
    };

    if (info.services[0].networkConfiguration) {
      taskParams.networkConfiguration = info.services[0].networkConfiguration;
    }

    if (overrideContainerCommand.length > 0 && !overrideContainer) {
      throw new Error(
        'override-container is required when override-container-command is set'
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
          'override-container-command is required when override-container is set'
        );
      }
    }

    core.debug('Running task...');
    let task = await ecs.runTask(taskParams).promise();
    const taskArn = task.tasks[0].taskArn;
    // core.setOutput('task-arn', taskArn);

    if (waitForFinish) {
      core.debug('Waiting for task to finish...');
      await ecs
        .waitFor('tasksStopped', { cluster, tasks: [taskArn] })
        .promise();

      core.debug('Checking status of task');
      task = await ecs.describeTasks({ cluster, tasks: [taskArn] }).promise();
      const exitCode = task.tasks[0].containers[0].exitCode;

      if (exitCode === 0) {
        // core.setOutput('status', 'success');
      } else {
        core.setFailed(task.tasks[0].stoppedReason);

        const taskHash = taskArn.split('/').pop();
        core.info(
          `task failed, you can check the error on Amazon ECS console: https://console.aws.amazon.com/ecs/home?region=${AWS.config.region}#/clusters/${cluster}/tasks/${taskHash}/details`
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
